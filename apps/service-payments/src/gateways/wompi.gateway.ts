import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@cobrai/db";
import type { CheckoutSession, CreateCheckoutInput, GatewayAdapter } from "./gateway.types";

// Confirmed against https://docs.wompi.co/en/docs/colombia/links-de-pago/
// (fetched live 2026-08-04): POST /v1/payment_links, Bearer <private key>.
// BYO tenant credentials are real business keys, so this adapter targets the
// production host directly rather than sandbox.wompi.co — matching the
// init_point-over-sandbox fix applied to MercadoPagoGateway.
const WOMPI_PAYMENT_LINKS_URL = "https://production.wompi.co/v1/payment_links";

/**
 * Wompi payment link creation via raw `fetch` — Wompi has no official Node
 * SDK (RESEARCH.md A5), so this follows the existing `createConektaCheckout`
 * shape: JSON body, `response.ok` guard, response text on failure.
 */
@Injectable()
export class WompiGateway implements GatewayAdapter {
  readonly provider: PaymentProvider = "wompi";

  private readonly logger = new Logger(WompiGateway.name);

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const privateKey = input.secrets.privateKey;
    if (!privateKey) {
      throw new Error("Wompi: falta privateKey del tenant");
    }

    const ref = randomUUID();

    const response = await fetch(WOMPI_PAYMENT_LINKS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${privateKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Pago de deuda",
        description: `Pago de deuda - ${input.debtorName}`,
        single_use: true,
        collect_shipping: false,
        currency: input.currency,
        // Wompi expects the amount in cents (integer) regardless of currency.
        amount_in_cents: Math.round(input.amount * 100),
        redirect_url: input.returnUrl,
        // Reconciliation key read by plan 08-12's webhook handler. Wompi's
        // Payment Links API has no dedicated "reference" field at creation
        // time (confirmed against the live docs page, deviating from this
        // plan's literal wording) — `sku` (max 36 chars, "internal unique
        // product identifier") is the closest documented field, and Wompi's
        // transaction webhook events for links created here also carry
        // `payment_link_id`, which equals the `gateway_ref` this method
        // returns and is the more reliable reconciliation key.
        sku: input.token.slice(0, 36)
      })
    });

    if (!response.ok) {
      const message = await this.extractErrorMessage(response);
      this.logger.error(`Wompi error: ${message}`);
      throw new Error(message || "No se pudo crear el link de pago Wompi");
    }

    const payload = (await response.json()) as { data?: { id?: string } };
    const id = payload.data?.id;

    return {
      // The create response does not include a hosted URL — Wompi's own docs
      // construct it as https://checkout.wompi.co/l/:payment_link_id.
      gateway_payment_url: id ? `https://checkout.wompi.co/l/${id}` : "",
      gateway_ref: id ?? ref
    };
  }

  /** Reads the body once as text, then attempts to parse Wompi's JSON error shape. */
  private async extractErrorMessage(response: Response): Promise<string> {
    const raw = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(raw) as { error?: { reason?: string; messages?: Record<string, string[]> } };
      if (parsed.error?.reason) return parsed.error.reason;
      if (parsed.error?.messages) return JSON.stringify(parsed.error.messages);
    } catch {
      // not JSON — fall through to raw text
    }
    return raw || "error desconocido";
  }
}
