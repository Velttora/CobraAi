import { Injectable, Logger } from "@nestjs/common";
import { PrismaService, type PaymentGateway } from "@cobrai/db";
import { PaymentConfirmationService } from "../payments/payment-confirmation.service";
import { WebhookValidatorService } from "./webhook-validator.service";
import { decimalToNumber } from "../common/utils/api.utils";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: WebhookValidatorService,
    private readonly confirmation: PaymentConfirmationService
  ) {}

  async handleConekta(
    rawBody: string,
    signature: string | undefined,
    body: unknown
  ): Promise<void> {
    this.validator.verifyConektaSignature(rawBody, signature);
    const payload = body as ConektaWebhookPayload;
    const eventType = payload.type;

    if (eventType !== "order.paid") {
      this.logger.log(`Conekta event ignorado: ${eventType}`);
      return;
    }

    const order = payload.data?.object;
    const token = order?.metadata?.payment_token;
    const gatewayRef = order?.id ?? order?.metadata?.gateway_ref;
    if (!token || !gatewayRef) return;

    await this.confirmFromToken(token, gatewayRef, "conekta", Number(order?.amount));
  }

  async handleMercadoPago(
    body: Record<string, unknown>,
    signature: string | undefined
  ): Promise<void> {
    this.validator.verifyMercadoPagoSignature(body, signature);

    const gatewayRef = String((body.data as { id?: string } | undefined)?.id ?? "");
    const token = String(body.external_reference ?? "");
    if (!gatewayRef || !token) return;

    await this.confirmFromToken(token, gatewayRef, "mercadopago");
  }

  private async confirmFromToken(
    token: string,
    gatewayRef: string,
    gateway: PaymentGateway,
    amountOverride?: number
  ): Promise<void> {
    const link = await this.prisma.paymentLink.findFirst({
      where: { token, deletedAt: null },
      include: { debt: true }
    });
    if (!link) return;

    await this.confirmation.confirmPayment({
      tenantId: link.tenantId,
      debtId: link.debtId,
      amount: amountOverride ?? decimalToNumber(link.amount),
      currency: link.currency,
      gateway,
      // This shared, hardcoded-per-provider webhook path is superseded by
      // 08-12's per-tenant webhook routing (D-19); until then, `provider`
      // is derived with the same legacy-compatible mapping payments.service.ts
      // uses (conekta has no equivalent under BYO per D-15/08-04's backfill).
      provider: gateway === "mercadopago" ? "mercadopago" : "transfer",
      gatewayRef,
      paymentLinkId: link.id
    });
  }
}

type ConektaWebhookPayload = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      amount?: number;
      metadata?: { payment_token?: string; gateway_ref?: string };
    };
  };
};
