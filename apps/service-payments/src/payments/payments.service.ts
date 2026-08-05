import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService, type PaymentProvider } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import {
  countryFromAddress,
  decimalToNumber,
  gatewayOptionsForCountry,
  maskDebtorName
} from "../common/utils/api.utils";
import { GatewayService } from "../gateways/gateway.service";
import { PaymentConfirmationService } from "./payment-confirmation.service";
import type { CreatePaymentLinkDto } from "./dto/payment.dto";

@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gateway: GatewayService,
    private readonly confirmation: PaymentConfirmationService,
    private readonly tenantIntegrations: TenantIntegrationService
  ) {}

  async create(tenantId: string, dto: CreatePaymentLinkDto) {
    const debt = await this.prisma.debt.findFirst({
      where: { id: dto.debt_id, tenantId, deletedAt: null },
      include: { debtor: true, tenant: true }
    });
    if (!debt) {
      throw new NotFoundException("Deuda no encontrada");
    }

    const amount = dto.amount ?? decimalToNumber(debt.amountOutstanding);
    if (amount <= 0) {
      throw new BadRequestException("La deuda no tiene saldo pendiente");
    }

    // D-06/D-12: under BYO the tenant's own configured payments provider is
    // the only valid dispatch key — never inferred from the debtor's
    // country (the deleted country/currency-based gateway heuristic).
    const integration = await this.tenantIntegrations.resolveByChannel(tenantId, "payments");
    if (!integration) {
      throw new BadRequestException("La organización no tiene un método de cobro configurado");
    }

    const expiresHours = dto.expires_in_hours ?? 48;
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

    // `resolveByChannel(tenantId, "payments")` only ever returns a provider
    // from CHANNEL_PROVIDERS.payments (a strict subset of PaymentProvider's
    // values) — narrow here, matching gateway.service.ts's own cast.
    const provider = integration.provider as PaymentProvider;

    const link = await this.prisma.paymentLink.create({
      data: {
        tenantId,
        debtId: debt.id,
        amount,
        currency: debt.currency,
        provider,
        // Legacy compatibility only: `provider` above is the source of
        // truth for dispatch. `gateway` is kept written with the closest
        // legacy value so any code still reading the old column (e.g. the
        // public pay page) does not see a null/stale value.
        gateway: provider === "mercadopago" ? "mercadopago" : "transfer",
        expiresAt
      }
    });

    const baseUrl =
      this.config.get<string>("PAYMENT_LINK_BASE_URL") ??
      "http://localhost:3001/pay";

    return {
      link_id: link.id,
      url: `${baseUrl.replace(/\/$/, "")}/${link.token}`,
      expires_at: link.expiresAt.toISOString(),
      amount,
      currency: link.currency,
      gateway: link.gateway
    };
  }

  async getPublicByToken(token: string) {
    const link = await this.prisma.paymentLink.findFirst({
      where: { token, deletedAt: null },
      include: {
        debt: { include: { debtor: true } },
        tenant: true
      }
    });

    if (!link) {
      throw new NotFoundException("Link de pago no encontrado");
    }

    if (link.status !== "active" || link.expiresAt < new Date()) {
      throw new BadRequestException("Link de pago expirado o usado");
    }

    const country = countryFromAddress(link.debt.debtor.address);

    return {
      deudor_partial_name: maskDebtorName(link.debt.debtor.name),
      amount: decimalToNumber(link.amount),
      currency: link.currency,
      // Kept alongside provider/method: apps/web/app/pay/[token]/page.tsx
      // still reads gateway/gateway_options and is out of this phase's
      // frontend scope.
      gateway_options: gatewayOptionsForCountry(country),
      company_name: link.tenant.name,
      gateway: link.gateway,
      provider: link.provider,
      method: link.method,
      token: link.token,
      status: link.status
    };
  }

  async checkout(token: string, selectedGateway?: string) {
    const link = await this.prisma.paymentLink.findFirst({
      where: { token, deletedAt: null, status: "active" },
      include: { debt: { include: { debtor: true } } }
    });

    if (!link) {
      throw new NotFoundException("Link de pago no encontrado");
    }
    if (link.expiresAt < new Date()) {
      throw new BadRequestException("Link expirado");
    }

    // `selectedGateway` is debtor-supplied, untrusted input on a public
    // endpoint (T-08-09a) — it is accepted for backward compatibility with
    // the controller's signature but has no effect on dispatch. The stored
    // `link.provider` is the only authoritative source.
    void selectedGateway;

    const baseUrl =
      this.config.get<string>("PAYMENT_LINK_BASE_URL") ??
      "http://localhost:3001/pay";

    const session = await this.gateway.createCheckout({
      tenantId: link.tenantId,
      amount: decimalToNumber(link.amount),
      currency: link.currency,
      token: link.token,
      debtorName: link.debt.debtor.name,
      returnUrl: `${baseUrl.replace(/\/$/, "")}/${link.token}`
    });

    if (link.provider === "transfer" || link.provider === "external_link") {
      return {
        gateway_payment_url: session.gateway_payment_url || null,
        instructions: session.instructions,
        gateway_ref: session.gateway_ref
      };
    }

    return {
      gateway_payment_url: session.gateway_payment_url,
      gateway_ref: session.gateway_ref
    };
  }

  async simulateSandboxPayment(token: string) {
    const link = await this.prisma.paymentLink.findFirst({
      where: { token, deletedAt: null },
      include: { debt: true }
    });
    if (!link) {
      throw new NotFoundException("Link no encontrado");
    }

    return this.confirmation.confirmPayment({
      tenantId: link.tenantId,
      debtId: link.debtId,
      amount: decimalToNumber(link.amount),
      currency: link.currency,
      gateway: link.gateway,
      provider: link.provider,
      method: link.method ?? undefined,
      gatewayRef: `sandbox_${link.token}`,
      paymentLinkId: link.id
    });
  }
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly confirmation: PaymentConfirmationService
  ) {}

  async list(tenantId: string, debtId?: string) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(debtId ? { debtId } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async refund(tenantId: string, paymentId: string, amount?: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId, deletedAt: null }
    });
    if (!payment) {
      throw new NotFoundException("Pago no encontrado");
    }
    if (payment.status !== "confirmed") {
      throw new BadRequestException("Solo se pueden reembolsar pagos confirmados");
    }

    const refundAmount = amount ?? decimalToNumber(payment.amount);

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: "refunded" }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: "payment.refunded",
        resourceType: "payment",
        resourceId: payment.id,
        changes: { amount: refundAmount }
      }
    });

    return updated;
  }
}
