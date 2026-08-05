import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import type { DecryptedIntegration } from "@cobrai/integrations";
import { PaymentConfirmationService } from "../payments/payment-confirmation.service";
import { decimalToNumber } from "../common/utils/api.utils";

interface StripeCheckoutEvent {
  type?: string;
  data?: { object?: { id?: string; metadata?: { token?: string } } };
}

interface WompiTransactionEvent {
  data?: { transaction?: { id?: string; payment_link_id?: string } };
}

/**
 * Per-provider payment reconciliation. Signature verification has already
 * happened in `WebhooksController` before any of these methods run — none of
 * them call `WebhookValidatorService`.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly confirmation: PaymentConfirmationService
  ) {}

  /** Dispatches to the matching per-provider reconciliation handler. */
  async handle(integration: DecryptedIntegration, rawBody: string): Promise<void> {
    switch (integration.provider) {
      case "stripe":
        return this.handleStripe(integration.tenantId, rawBody);
      case "mercadopago":
        return this.handleMercadoPago(integration.tenantId, rawBody);
      case "wompi":
        return this.handleWompi(integration, rawBody);
      case "payu":
        return this.handlePayu(integration.tenantId, rawBody);
      case "epayco":
        return this.handleEpayco(integration.tenantId, rawBody);
      default:
        // Unreachable — WebhooksController only dispatches the five
        // webhook-capable payment providers here.
        return;
    }
  }

  /** Reconciliation field per 08-08-SUMMARY.md: `metadata.token`, read from `checkout.session.completed`. */
  private async handleStripe(tenantId: string, rawBody: string): Promise<void> {
    const event = this.parseJson<StripeCheckoutEvent>(rawBody);
    if (event?.type !== "checkout.session.completed") return;

    const session = event.data?.object;
    const token = session?.metadata?.token;
    const gatewayRef = session?.id;
    if (!token || !gatewayRef) return;

    await this.confirmFromToken(tenantId, token, gatewayRef);
  }

  /** Reconciliation field per 08-08-SUMMARY.md: `external_reference`. */
  private async handleMercadoPago(tenantId: string, rawBody: string): Promise<void> {
    const body = this.parseJson<Record<string, unknown>>(rawBody) ?? {};
    const gatewayRef = String((body.data as { id?: string } | undefined)?.id ?? "");
    const token = String(body.external_reference ?? "");
    if (!gatewayRef || !token) return;

    await this.confirmFromToken(tenantId, token, gatewayRef);
  }

  /**
   * Wompi's transaction webhook does not carry `sku` (the field
   * `WompiGateway.createCheckout` wrote `PaymentLink.token` into) — only the
   * Payment Link resource itself does (confirmed live against
   * docs.wompi.co/en/docs/colombia/eventos/, 2026-08-04). One extra
   * authenticated GET recovers it via `payment_link_id`, which the
   * transaction event does carry, per 08-08-SUMMARY.md's own note flagging
   * this gap for this plan.
   */
  private async handleWompi(integration: DecryptedIntegration, rawBody: string): Promise<void> {
    const event = this.parseJson<WompiTransactionEvent>(rawBody);
    const transaction = event?.data?.transaction;
    const paymentLinkId = transaction?.payment_link_id;
    const gatewayRef = transaction?.id;
    if (!paymentLinkId || !gatewayRef) return;

    const token = await this.lookupWompiPaymentLinkSku(paymentLinkId, integration.secrets.privateKey);
    if (!token) return;

    await this.confirmFromToken(integration.tenantId, token, gatewayRef);
  }

  private async lookupWompiPaymentLinkSku(paymentLinkId: string, privateKey: string | undefined): Promise<string | null> {
    if (!privateKey) return null;
    try {
      const response = await fetch(`https://production.wompi.co/v1/payment_links/${paymentLinkId}`, {
        headers: { Authorization: `Bearer ${privateKey}` }
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: { sku?: string } };
      return payload.data?.sku ?? null;
    } catch (err) {
      this.logger.warn(`No se pudo recuperar el payment link de Wompi ${paymentLinkId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Reconciliation field per 08-08-SUMMARY.md: `referenceCode`, echoed back
   * as `reference_sale`. Only `state_pol=4` (Approved, per PayU's own
   * Confirmation URL docs) confirms a payment — other final states
   * (Declined, Expired) must never mark a debt as paid.
   */
  private async handlePayu(tenantId: string, rawBody: string): Promise<void> {
    const body = Object.fromEntries(new URLSearchParams(rawBody));
    if (body.state_pol !== "4") return;

    const token = body.reference_sale;
    const gatewayRef = body.transaction_id ?? body.reference_pol;
    if (!token || !gatewayRef) return;

    await this.confirmFromToken(tenantId, token, gatewayRef);
  }

  /**
   * Reconciliation field per 08-08-SUMMARY.md: `invoice`, echoed back as
   * `x_id_factura`. Only `x_cod_transaction_state=1` ("Aceptada", per
   * ePayco's own docs) confirms a payment.
   */
  private async handleEpayco(tenantId: string, rawBody: string): Promise<void> {
    const body = Object.fromEntries(new URLSearchParams(rawBody));
    if (body.x_cod_transaction_state !== "1") return;

    const token = body.x_id_factura;
    const gatewayRef = body.x_ref_payco ?? body.x_transaction_id;
    if (!token || !gatewayRef) return;

    await this.confirmFromToken(tenantId, token, gatewayRef);
  }

  /**
   * A webhook whose token matches no payment link for this tenant is a
   * no-op returning 200 — providers retry on non-2xx, and a permanent
   * mismatch would retry forever (T-08-07e). Scoping the lookup to
   * `tenantId` (the resolved integration's own tenant, not just any tenant)
   * also rejects a cross-tenant replay where a valid, correctly-signed
   * webhook for tenant A carries a token that happens to belong to tenant
   * B's payment link (T-08-07f).
   */
  private async confirmFromToken(tenantId: string, token: string, gatewayRef: string): Promise<void> {
    const link = await this.prisma.paymentLink.findFirst({
      where: { token, tenantId, deletedAt: null }
    });
    if (!link) return;

    await this.confirmation.confirmPayment({
      tenantId: link.tenantId,
      debtId: link.debtId,
      amount: decimalToNumber(link.amount),
      currency: link.currency,
      gateway: link.gateway,
      provider: link.provider,
      gatewayRef,
      paymentLinkId: link.id
    });
  }

  private parseJson<T>(rawBody: string): T | undefined {
    try {
      return JSON.parse(rawBody) as T;
    } catch {
      return undefined;
    }
  }
}
