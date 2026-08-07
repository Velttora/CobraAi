import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
// Value import, not `import type`: Nest reads the constructor's design:paramtypes
// metadata to resolve this dependency, and a type-only import is erased at
// compile time — the emitted metadata becomes `Function` and the module fails to
// boot with "can't resolve dependencies of the IntegrationsService".
import { PrismaService } from "@cobrai/db";
import type { IntegrationProvider } from "@cobrai/db";
import { PROVIDER_CHANNEL, TenantIntegrationService } from "@cobrai/integrations";
import type { IntegrationView } from "@cobrai/integrations";
import { validateExternalLinkTemplate } from "@cobrai/utils";
import { WhatsAppConnectService } from "./whatsapp-connect.service";
import { EmailConnectService } from "./email-connect.service";
import type { EmbeddedSignupDto, SaveIntegrationDto } from "./dto/integration.dto";
import {
  ALL_PROVIDERS,
  assertValidProvider,
  normalizeClerkRole,
  notConfiguredView
} from "./integrations.provider-utils";
import { queryUncontactedDebts, type UncontactedDebtsPage } from "./integrations.uncontacted-debts.query";

const SKIP_VERIFICATION_PROVIDERS: IntegrationProvider[] = ["external_link", "transfer"];

/**
 * REST-facing surface for `Settings > Integraciones` (D-23/D-24). Every read
 * goes through `TenantIntegrationService.toView` (redaction by construction,
 * D-26); every write is gated by `assertAdmin` here in the service layer, not
 * only at the gateway (T-08-14b) — this service is protected even if it were
 * ever called directly, bypassing api-gateway's header injection.
 */
@Injectable()
export class IntegrationsService {
  private readonly baseWebhookUrl: string;

  constructor(
    private readonly tenantIntegrations: TenantIntegrationService,
    private readonly whatsappConnect: WhatsAppConnectService,
    private readonly emailConnect: EmailConnectService,
    private readonly prisma: PrismaService,
    config: ConfigService
  ) {
    this.baseWebhookUrl = config.get<string>("PUBLIC_WEBHOOK_BASE_URL") ?? "";
  }

  /** Ported from `apps/api-gateway/src/tenant/tenant.service.ts`'s `assertAdmin` — same comparison, same Spanish message shape. */
  assertAdmin(role?: string): void {
    if (normalizeClerkRole(role) !== "admin") {
      throw new ForbiddenException("Solo administradores pueden gestionar las integraciones");
    }
  }

  /** One `IntegrationView` per configurable provider — reads are not admin-gated (matches `TenantController`'s unguarded `@Get()`); every view is redacted regardless of caller role. */
  async list(tenantId: string): Promise<IntegrationView[]> {
    const rows = await this.tenantIntegrations.listViews(tenantId, this.baseWebhookUrl);
    const byProvider = new Map(rows.map((view) => [view.provider, view]));
    return ALL_PROVIDERS.map((provider) => byProvider.get(provider) ?? notConfiguredView(provider));
  }

  /** Dispatches a credential write to the matching connect service (comm channels) or `TenantIntegrationService.upsert` directly (payments). */
  async save(tenantId: string, providerParam: string, dto: SaveIntegrationDto, role?: string): Promise<IntegrationView> {
    this.assertAdmin(role);
    const provider = assertValidProvider(providerParam);
    const publicConfig = dto.publicConfig ?? {};
    const secrets = dto.secrets ?? {};

    if (PROVIDER_CHANNEL[provider] === "payments" && dto.mode !== "byo") {
      throw new BadRequestException("Los métodos de cobro solo admiten conexión BYO — no existe modo gestionado (D-06)");
    }

    if (provider === "twilio_whatsapp" || provider === "twilio_voice") {
      return this.saveTwilio(tenantId, provider, dto, publicConfig, secrets);
    }

    if (provider === "sendgrid") {
      return this.saveSendgrid(tenantId, dto, publicConfig, secrets);
    }

    return this.savePayment(tenantId, provider, publicConfig, secrets);
  }

  /** Re-runs verification using the stored secrets — the caller never resends them. */
  async verify(tenantId: string, providerParam: string, role?: string): Promise<IntegrationView> {
    this.assertAdmin(role);
    const provider = assertValidProvider(providerParam);

    if (provider === "twilio_whatsapp") {
      return this.whatsappConnect.refreshSenderStatus(tenantId);
    }
    if (provider === "sendgrid") {
      return this.emailConnect.recheckDns(tenantId);
    }

    const stored = await this.tenantIntegrations.resolveAny(tenantId, provider);
    if (!stored) {
      throw new NotFoundException(`${provider} no configurado para este tenant`);
    }
    return this.tenantIntegrations.upsert({
      tenantId,
      provider,
      mode: stored.mode,
      publicConfig: stored.publicConfig,
      secrets: {},
      skipVerification: SKIP_VERIFICATION_PROVIDERS.includes(provider),
      baseWebhookUrl: this.baseWebhookUrl
    });
  }

  /** Soft-deletes the integration and returns the resulting `not_configured` view. */
  async disconnect(tenantId: string, providerParam: string, role?: string): Promise<IntegrationView> {
    this.assertAdmin(role);
    const provider = assertValidProvider(providerParam);
    await this.tenantIntegrations.disconnect(tenantId, provider);
    return notConfiguredView(provider);
  }

  /** D-25: the browser hands off Embedded Signup's output for the managed WhatsApp connection. */
  async embeddedSignup(tenantId: string, dto: EmbeddedSignupDto, role?: string): Promise<IntegrationView> {
    this.assertAdmin(role);
    return this.whatsappConnect.connectManaged({
      tenantId,
      wabaId: dto.wabaId,
      phoneNumberId: dto.phoneNumberId,
      phoneNumberE164: dto.phoneNumberE164,
      businessName: dto.businessName
    });
  }

  /** Backs the UI's "Ya los publiqué, verificar" button on the email DNS panel. */
  async recheckEmailDns(tenantId: string, role?: string): Promise<IntegrationView> {
    this.assertAdmin(role);
    return this.emailConnect.recheckDns(tenantId);
  }

  /** Backs the UI's "2 de 4 integraciones operativas" line — `pending_dns`/`pending_meta` count as not-operational: nothing can send in either intermediate state. */
  async health(tenantId: string): Promise<{ items: IntegrationView[]; summary: { operational: number; total: number } }> {
    const items = await this.list(tenantId);
    const operational = items.filter((view) => view.status === "verified").length;
    return { items, summary: { operational, total: items.length } };
  }

  /** Debts blocked by `channel_not_configured` (D-16) — the fourth screen's reason to exist. */
  async uncontactedDebts(tenantId: string, page: number, pageSize: number): Promise<UncontactedDebtsPage> {
    return queryUncontactedDebts(this.prisma, tenantId, page, pageSize);
  }

  /** BYO Twilio credentials. `twilio_voice` shares the same subaccount/number as `twilio_whatsapp` (D-05) — connecting either dispatches through the same orchestrator, then this re-reads the view for the specific provider that was requested. */
  private async saveTwilio(
    tenantId: string,
    provider: "twilio_whatsapp" | "twilio_voice",
    dto: SaveIntegrationDto,
    publicConfig: Record<string, string>,
    secrets: Record<string, string>
  ): Promise<IntegrationView> {
    if (dto.mode !== "byo") {
      throw new BadRequestException(
        "La conexión gestionada de WhatsApp/voz se hace mediante Embedded Signup, no con PUT /v1/integrations/:provider"
      );
    }

    await this.whatsappConnect.connectByo({
      tenantId,
      accountSid: publicConfig["accountSid"] ?? "",
      authToken: secrets["authToken"] ?? "",
      phoneNumberE164: publicConfig["phoneNumberE164"] ?? ""
    });

    return this.viewFor(tenantId, provider);
  }

  private async saveSendgrid(
    tenantId: string,
    dto: SaveIntegrationDto,
    publicConfig: Record<string, string>,
    secrets: Record<string, string>
  ): Promise<IntegrationView> {
    if (dto.mode === "managed") {
      return this.emailConnect.connectManaged({
        tenantId,
        domain: publicConfig["domain"] ?? "",
        fromEmail: publicConfig["fromEmail"] ?? "",
        fromName: publicConfig["fromName"] ?? "",
        adminEmail: publicConfig["adminEmail"] ?? publicConfig["fromEmail"] ?? "",
        replyDomain: publicConfig["replyDomain"]
      });
    }

    return this.emailConnect.connectByo({
      tenantId,
      apiKey: secrets["apiKey"] ?? "",
      fromEmail: publicConfig["fromEmail"] ?? "",
      fromName: publicConfig["fromName"] ?? "",
      domain: publicConfig["domain"] ?? "",
      replyDomain: publicConfig["replyDomain"]
    });
  }

  private async savePayment(
    tenantId: string,
    provider: IntegrationProvider,
    publicConfig: Record<string, string>,
    secrets: Record<string, string>
  ): Promise<IntegrationView> {
    if (provider === "external_link") {
      const template = publicConfig["template"] ?? "";
      const errors = validateExternalLinkTemplate(template);
      if (errors.length > 0) {
        throw new BadRequestException(errors[0]?.message ?? "Plantilla de enlace de pago inválida");
      }
    }

    const view = await this.tenantIntegrations.upsert({
      tenantId,
      provider,
      mode: "byo",
      publicConfig,
      secrets,
      skipVerification: SKIP_VERIFICATION_PROVIDERS.includes(provider),
      baseWebhookUrl: this.baseWebhookUrl
    });

    if (view.status === "verified") {
      await this.retirePreviousPaymentProviders(tenantId, provider);
    }

    return view;
  }

  /**
   * Payments is a single-choice channel: the tenant picks one gateway and every
   * payment link must route to it.
   *
   * `resolveByChannel` returns the first verified provider in a FIXED order
   * (stripe → wompi → payu → epayco → mercadopago → external_link → transfer),
   * so leaving an older row verified means it keeps winning no matter what the
   * tenant selected — a tenant who moved from Stripe to Wompi would still be
   * charging through Stripe. That is money routed to the wrong processor, so
   * saving a gateway retires the others.
   *
   * Only runs once the new provider is actually usable: if verification failed,
   * retiring the previous one would leave the tenant unable to charge at all.
   */
  private async retirePreviousPaymentProviders(
    tenantId: string,
    keep: IntegrationProvider
  ): Promise<void> {
    const others = ALL_PROVIDERS.filter(
      (candidate) => PROVIDER_CHANNEL[candidate] === "payments" && candidate !== keep
    );

    for (const other of others) {
      const existing = await this.tenantIntegrations.resolveAny(tenantId, other);
      if (existing) {
        await this.tenantIntegrations.disconnect(tenantId, other);
      }
    }
  }

  private async viewFor(tenantId: string, provider: IntegrationProvider): Promise<IntegrationView> {
    const views = await this.tenantIntegrations.listViews(tenantId, this.baseWebhookUrl);
    return views.find((view) => view.provider === provider) ?? notConfiguredView(provider);
  }
}
