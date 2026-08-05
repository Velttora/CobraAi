import type { PaymentProvider } from "@cobrai/db";

/**
 * Unchanged from the legacy `gateway.service.ts` export — downstream code
 * (`payments.service.ts`) already destructures this shape.
 */
export type CheckoutSession = {
  gateway_payment_url: string;
  gateway_ref: string;
  instructions?: string;
};

export interface CreateCheckoutInput {
  amount: number;
  currency: string;
  /** PaymentLink.token — the reconciliation key echoed back by every provider's webhook. */
  token: string;
  debtorName: string;
  /** Public, non-secret configuration from TenantIntegration.publicConfig. */
  publicConfig: Record<string, string>;
  /** Decrypted per-tenant credentials. Never read from ConfigService (D-06). */
  secrets: Record<string, string>;
  /** Public URL the debtor returns to after paying. */
  returnUrl: string;
}

/**
 * Every payment gateway adapter implements this contract. BYO only (D-06):
 * credentials always arrive via `input.secrets`/`input.publicConfig`, resolved
 * per call by `TenantIntegrationService` — never read from `ConfigService` and
 * never cached across tenants.
 */
export interface GatewayAdapter {
  readonly provider: PaymentProvider;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
}
