import type { Debtor } from "@cobrai/db";

/** Optional identity fields a hosted checkout may require. */
export interface DebtorIdentity {
  debtorEmail?: string;
  debtorPhone?: string;
  debtorDocument?: string;
  debtorDocumentType?: string;
}

/**
 * Pulls the first usable phone out of `Debtor.phones`, which is a Json column
 * holding either bare strings or `{ number }` objects depending on how the
 * portfolio was imported.
 */
function firstPhone(phones: unknown): string | undefined {
  if (!Array.isArray(phones)) return undefined;
  for (const entry of phones) {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (entry && typeof entry === "object") {
      const number = (entry as { number?: unknown }).number;
      if (typeof number === "string" && number.trim()) return number.trim();
    }
  }
  return undefined;
}

/**
 * Maps a debtor onto the identity fields a hosted checkout may need.
 *
 * PayU's WebCheckout marks payer/buyer name, email, phone and document as
 * mandatory and rejects the form when they are absent, so a checkout built
 * from amount and token alone never reaches the payment step. Every field is
 * optional here because the debtor record does not always carry all of them —
 * the adapter decides what to do with a gap, rather than this helper inventing
 * a placeholder that would reach a real payment page.
 */
export function debtorIdentity(debtor: Pick<Debtor, "type" | "taxId" | "email" | "phones">): DebtorIdentity {
  const phone = firstPhone(debtor.phones);
  return {
    ...(debtor.email ? { debtorEmail: debtor.email } : {}),
    ...(phone ? { debtorPhone: phone } : {}),
    ...(debtor.taxId
      ? {
          debtorDocument: debtor.taxId,
          debtorDocumentType: debtor.type === "company" ? "NIT" : "CC"
        }
      : {})
  };
}
