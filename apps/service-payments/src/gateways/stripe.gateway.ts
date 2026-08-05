import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@cobrai/db";
import type { CheckoutSession, CreateCheckoutInput, GatewayAdapter } from "./gateway.types";

const STRIPE_PAYMENT_LINKS_URL = "https://api.stripe.com/v1/payment_links";

/**
 * Stripe checkout via raw `fetch` against the Payment Links REST API
 * (https://docs.stripe.com/api/payment-link/create), matching this repo's
 * existing `createConektaCheckout` convention rather than the official SDK.
 *
 * Deviation from the plan: Task 1's package-legitimacy gate for the `stripe`
 * npm package is `gate="blocking-human"` and was not clearable by a genuine
 * user response in this session (see SUMMARY). Per the plan's own documented
 * fallback ("the plan then falls back to raw fetch... needs no dependency at
 * all"), this adapter uses `fetch` and no `stripe` package was installed.
 *
 * Stripe's REST API expects `application/x-www-form-urlencoded` bodies with
 * bracket-notation for nested objects/arrays — not JSON.
 */
@Injectable()
export class StripeGateway implements GatewayAdapter {
  readonly provider: PaymentProvider = "stripe";

  private readonly logger = new Logger(StripeGateway.name);

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const secretKey = input.secrets.secretKey;
    if (!secretKey) {
      throw new Error("Stripe: falta secretKey del tenant");
    }

    const ref = randomUUID();
    const body = this.buildFormBody(input);

    const response = await fetch(STRIPE_PAYMENT_LINKS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const message = await this.extractErrorMessage(response);
      this.logger.error(`Stripe error: ${message}`);
      throw new Error(message || "No se pudo crear el payment link de Stripe");
    }

    const data = (await response.json()) as { id?: string; url?: string };

    return {
      gateway_payment_url: data.url ?? "",
      gateway_ref: data.id ?? ref
    };
  }

  /**
   * Amount is sent in the smallest currency unit assuming a 2-decimal
   * currency, matching this repo's existing Conekta convention. Zero-decimal
   * currencies (e.g. COP under Stripe) are not special-cased here since no
   * tenant has configured Stripe with a zero-decimal currency yet.
   */
  private buildFormBody(input: CreateCheckoutInput): string {
    const params = new URLSearchParams();
    params.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
    params.set("line_items[0][price_data][product_data][name]", "Pago de deuda");
    params.set("line_items[0][price_data][unit_amount]", String(Math.round(input.amount * 100)));
    params.set("line_items[0][quantity]", "1");
    // Reconciliation key read by plan 08-12's webhook handler from the
    // checkout.session.completed event's payment_link metadata.
    params.set("metadata[token]", input.token);
    params.set("after_completion[type]", "redirect");
    params.set("after_completion[redirect][url]", input.returnUrl);
    return params.toString();
  }

  /** Reads the body once as text, then attempts to parse Stripe's JSON error shape. */
  private async extractErrorMessage(response: Response): Promise<string> {
    const raw = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      // not JSON — fall through to raw text
    }
    return raw || "error desconocido";
  }
}
