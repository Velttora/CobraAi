import { Injectable } from "@nestjs/common";
import type { PaymentProvider } from "@cobrai/db";
import type { CheckoutSession, CreateCheckoutInput, GatewayAdapter } from "./gateway.types";

// Endpoint confidence: LOW / partially unconfirmed. This session confirmed
// `checkout.epayco.co` as ePayco's checkout host (it serves the client-side
// `checkout.js` SDK referenced from https://docs.epayco.com/docs/url-de-confirmacion,
// fetched live 2026-08-04) but could not confirm a documented server-side
// "create hosted checkout link" REST endpoint — ePayco's current docs surface
// a client-side JS widget (`ePayco.checkout.configure(...).open(data)`) and a
// separate dashboard-configured "Recaudo en línea" product, neither of which
// is a bare redirect URL a backend can construct. Per this plan's own
// contingency ("mark that adapter's status in the SUMMARY rather than
// guessing a URL"), this adapter targets the long-established
// `checkout.epayco.co/checkout.php` hosted-checkout redirect using the same
// field names the `checkout.js` widget accepts — record this as unconfirmed
// in the SUMMARY and flag for a real sandbox transaction before go-live.
const EPAYCO_CHECKOUT_URL = "https://checkout.epayco.co/checkout.php";

/**
 * ePayco has no official Node SDK — this follows the raw-`fetch`-free,
 * query-string redirect pattern (no HTTP call is needed to build the URL;
 * the debtor's browser talks to ePayco directly).
 */
@Injectable()
export class EpaycoGateway implements GatewayAdapter {
  readonly provider: PaymentProvider = "epayco";

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const publicKey = input.publicConfig.publicKey;
    // custIdCliente does not appear in the checkout URL itself, but plan
    // 08-12's confirmation signature (sha256(p_cust_id_cliente^p_key^...))
    // needs it — validated here so a checkout is never created for a tenant
    // whose webhook could never be verified.
    const custIdCliente = input.publicConfig.custIdCliente;
    if (!publicKey || !custIdCliente) {
      throw new Error("ePayco: falta custIdCliente o publicKey del tenant");
    }

    const params = new URLSearchParams({
      public_key: publicKey,
      // Reconciliation key: ePayco echoes this back on its confirmation
      // callback as x_id_factura, which plan 08-12's webhook reads.
      invoice: input.token,
      description: "Pago de deuda",
      amount: input.amount.toFixed(2),
      currency: input.currency.toLowerCase(),
      country: "co",
      lang: "es",
      external: "true",
      response: input.returnUrl
    });

    return {
      gateway_payment_url: `${EPAYCO_CHECKOUT_URL}?${params.toString()}`,
      gateway_ref: input.token
    };
  }
}
