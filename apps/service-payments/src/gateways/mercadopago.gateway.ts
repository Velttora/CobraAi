import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@cobrai/db";
import type { CheckoutSession, CreateCheckoutInput, GatewayAdapter } from "./gateway.types";

const MP_PREFERENCES_URL = "https://api.mercadopago.com/checkout/preferences";

/**
 * Mercado Pago checkout via raw `fetch` against the Checkout Preferences API,
 * lifted from the legacy `createMercadoPagoCheckout` in `gateway.service.ts`
 * with three changes required by D-06/D-17: the access token comes from
 * `input.secrets.accessToken` (never a platform-level config service), the
 * simulate-on-missing-credential branch is deleted rather than ported, and
 * the returned URL prefers `init_point` over `sandbox_init_point` — the
 * legacy code had this backwards, which would send a tenant's real debtor to
 * a sandbox checkout.
 */
@Injectable()
export class MercadoPagoGateway implements GatewayAdapter {
  readonly provider: PaymentProvider = "mercadopago";

  private readonly logger = new Logger(MercadoPagoGateway.name);

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const accessToken = input.secrets.accessToken;
    if (!accessToken) {
      throw new Error("Mercado Pago: falta accessToken del tenant");
    }

    const ref = randomUUID();

    const response = await fetch(MP_PREFERENCES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [
          {
            title: "Pago de deuda CobraAI",
            quantity: 1,
            unit_price: input.amount,
            currency_id: input.currency
          }
        ],
        // Reconciliation key: Mercado Pago echoes external_reference back on
        // every payment notification, which plan 08-12's webhook reads.
        external_reference: input.token,
        metadata: { gateway_ref: ref },
        back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Mercado Pago error: ${detail}`);
      throw new Error(detail || "No se pudo crear preferencia MP");
    }

    const data = (await response.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    return {
      // D-06 fix: production credentials must resolve to init_point, never
      // sandbox_init_point — the legacy code preferred sandbox first.
      gateway_payment_url: data.init_point ?? data.sandbox_init_point ?? "",
      gateway_ref: data.id ?? ref
    };
  }
}
