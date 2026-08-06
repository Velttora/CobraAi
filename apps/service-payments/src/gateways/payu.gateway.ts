import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PaymentProvider } from "@cobrai/db";
import type { CheckoutSession, CreateCheckoutInput, GatewayAdapter } from "./gateway.types";

// Confirmed against PayU Latam's WebCheckout Payment Form guide
// (https://developers.payulatam.com/latam/en/docs/integrations/webcheckout-integration/payment-form.html,
// fetched live 2026-08-04). BYO tenant credentials are production merchant
// accounts, so this targets the production gateway host, not the sandbox one
// shown in the docs' example (sandbox.checkout.payulatam.com).
const PAYU_CHECKOUT_URL = "https://checkout.payulatam.com/ppp-web-gateway-payu/";

/**
 * PayU Colombia has no official Node SDK — its WebCheckout integration is a
 * browser HTML form POST, not a JSON REST API. This adapter builds the same
 * redirect URL as a query string against the WebCheckout gateway, matching
 * this contract's single-URL `CheckoutSession` shape. The frontend page that
 * renders `gateway_payment_url` is responsible for a real POST redirect if
 * PayU rejects GET query params for a given merchant configuration.
 */
@Injectable()
export class PayuGateway implements GatewayAdapter {
  readonly provider: PaymentProvider = "payu";

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const apiKey = input.secrets.apiKey;
    const merchantId = input.publicConfig.merchantId;
    const accountId = input.publicConfig.accountId;
    if (!apiKey || !merchantId || !accountId) {
      throw new Error("PayU: falta apiKey, merchantId o accountId del tenant");
    }

    // referenceCode is the reconciliation key plan 08-12's confirmation
    // webhook reads back as reference_sale.
    const referenceCode = input.token;
    // PayU requires the amount value in the signature to be byte-identical
    // to the amount field sent in the form — both derive from this string.
    const amount = input.amount.toFixed(2);
    const currency = input.currency.toUpperCase();

    // Signature formula documented by PayU: apiKey~merchantId~referenceCode~amount~currency.
    // The confirmation-side signature (verified by plan 08-12) uses a
    // different, related formula: apiKey~merchant_id~reference_sale~value~currency~state_pol.
    const signatureString = `${apiKey}~${merchantId}~${referenceCode}~${amount}~${currency}`;
    const signature = createHash("md5").update(signatureString).digest("hex");

    const params = new URLSearchParams({
      merchantId,
      accountId,
      description: "Pago de deuda",
      referenceCode,
      amount,
      // Debt collection is not a taxable sale in this context; PayU requires
      // tax/taxReturnBase to be present and accepts 0 for VAT-exempt sales.
      tax: "0",
      taxReturnBase: "0",
      currency,
      signature,
      algorithmSignature: "MD5",
      responseUrl: input.returnUrl,
      test: "0"
    });

    // PayU's WebCheckout parameter table marks payer and buyer identity
    // Mandatory: Yes. Without them its own form validation rejects the
    // request before the debtor can enter card details, so the payment link
    // is simply dead. They are appended rather than inlined above because
    // they are absent from the signature formula — adding them there would
    // break it.
    appendIfPresent(params, "payerFullName", input.debtorName);
    appendIfPresent(params, "buyerFullName", input.debtorName);
    appendIfPresent(params, "payerEmail", input.debtorEmail);
    appendIfPresent(params, "buyerEmail", input.debtorEmail);
    appendIfPresent(params, "payerPhone", input.debtorPhone);
    appendIfPresent(params, "payerDocument", input.debtorDocument);
    appendIfPresent(params, "buyerDocument", input.debtorDocument);
    appendIfPresent(params, "payerDocumentType", input.debtorDocumentType);
    appendIfPresent(params, "buyerDocumentType", input.debtorDocumentType);

    return {
      gateway_payment_url: `${PAYU_CHECKOUT_URL}?${params.toString()}`,
      gateway_ref: referenceCode
    };
  }
}

/** Omits the key entirely when the debtor record has no value for it. */
function appendIfPresent(params: URLSearchParams, key: string, value?: string): void {
  if (value && value.trim()) params.set(key, value.trim());
}
