import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@cobrai/db";
import type { CheckoutSession, CreateCheckoutInput, GatewayAdapter } from "./gateway.types";

/**
 * `transfer` makes no HTTP call and produces no payable URL — it returns
 * Spanish bank-transfer instructions built from the tenant's own account
 * details (`publicConfig.bankName`/`accountType`/`accountNumber`/
 * `accountHolder`/`taxId`, all plaintext, not secrets — UI-SPEC "Provider
 * options"). Fields the tenant left blank are skipped rather than printed
 * as the literal string "undefined".
 *
 * D-14: this provider has no webhook, so reconciliation is manual in the
 * dashboard — a debtor's "already paid" claim only creates a
 * `promise_to_pay` pending confirmation, never a silent success.
 */
@Injectable()
export class TransferGateway implements GatewayAdapter {
  readonly provider: PaymentProvider = "transfer";

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const ref = randomUUID();

    const lines: string[] = [];
    if (input.publicConfig.bankName) lines.push(`Banco: ${input.publicConfig.bankName}`);
    if (input.publicConfig.accountType) lines.push(`Tipo de cuenta: ${input.publicConfig.accountType}`);
    if (input.publicConfig.accountNumber) lines.push(`Número de cuenta: ${input.publicConfig.accountNumber}`);
    if (input.publicConfig.accountHolder) lines.push(`Titular: ${input.publicConfig.accountHolder}`);
    if (input.publicConfig.taxId) lines.push(`NIT: ${input.publicConfig.taxId}`);
    lines.push(`Referencia: ${input.token}`);

    return {
      gateway_payment_url: "",
      gateway_ref: ref,
      instructions: `Transferencia bancaria. ${lines.join(". ")}.`
    };
  }
}
