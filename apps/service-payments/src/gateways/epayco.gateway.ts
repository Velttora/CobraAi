import { Injectable } from "@nestjs/common";
import type { PaymentProvider } from "@cobrai/db";
import type { CheckoutSession, CreateCheckoutInput, GatewayAdapter } from "./gateway.types";

/**
 * ePayco checkout creation is DISABLED.
 *
 * The adapter targeted `https://checkout.epayco.co/checkout.php`, which
 * returns HTTP 403 (S3 AccessDenied) as of 2026-08-06 — verified directly.
 * The same host still serves `checkout.js` with 200, so the endpoint is gone
 * rather than the host being down. Handing a debtor a URL that 403s means they
 * simply cannot pay, and the tenant only learns of it from an unpaid debt.
 *
 * ePayco's current flow appears to be a two-step
 * `POST /create/transaction/{key}/{session}` followed by a redirect to
 * `secure.epayco.co/v1/transaction/payment.html`, but that was recovered from
 * their minified `checkout.js` rather than from documentation. It is
 * deliberately not implemented blind: a wrong guess here would be broken in a
 * subtler way than a 403, while looking like it works. Restoring this gateway
 * needs one real sandbox transaction to confirm the request shape before any
 * debtor is routed through it — the invariants it must preserve are pinned in
 * the `[restauración]` case in this adapter's spec.
 */
@Injectable()
export class EpaycoGateway implements GatewayAdapter {
  readonly provider: PaymentProvider = "epayco";

  async createCheckout(_input: CreateCheckoutInput): Promise<CheckoutSession> {
    throw new Error(
      "ePayco: la creación de checkout está deshabilitada — el endpoint de ePayco " +
        "cambió y el flujo nuevo no se ha verificado contra un sandbox real. " +
        "Configura otro proveedor de cobro mientras tanto."
    );
  }
}
