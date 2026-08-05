import { Injectable } from "@nestjs/common";
import { resolveExternalLinkTemplate } from "@cobrai/utils";
import type { PaymentProvider } from "@cobrai/db";
import type { CheckoutSession, CreateCheckoutInput, GatewayAdapter } from "./gateway.types";

/**
 * `external_link` makes no HTTP call: the tenant's template
 * (`publicConfig.template`) is resolved per-debt with `{monto}`/`{ref}`/
 * `{nombre}` (D-13). Covers Bold, Nequi, Wompi payment links, PayU checkout
 * links, etc. without integrating anything.
 *
 * D-14: this provider has no webhook, so reconciliation is manual in the
 * dashboard — a debtor's "already paid" claim only creates a
 * `promise_to_pay` pending confirmation, never a silent success.
 */
@Injectable()
export class ExternalLinkGateway implements GatewayAdapter {
  readonly provider: PaymentProvider = "external_link";

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const template = input.publicConfig.template;
    if (!template) {
      throw new Error("Enlace externo: falta la plantilla de enlace del tenant");
    }

    const ref = input.publicConfig.externalRef ?? input.token;

    const resolved = resolveExternalLinkTemplate(template, {
      monto: String(input.amount),
      ref,
      nombre: input.debtorName
    });

    return {
      gateway_payment_url: resolved,
      gateway_ref: input.token
    };
  }
}
