import { decryptSecretBundle, lastFour } from "@cobrai/utils";
import type { IntegrationProvider } from "@cobrai/db";

/** Persisted shape of `TenantIntegration.secretsMeta` — a map of field name to redacted metadata. */
export type StoredSecretsMeta = Record<string, { lastFour: string | null; savedAt: string | null }>;

/**
 * Decrypts a ciphertext buffer, catching and logging any failure without
 * ever including the ciphertext in the log line (T-08-03e) — a corrupted
 * row must degrade to "not configured", never crash a send. Extracted from
 * `TenantIntegrationService` to keep that file under the 300-line limit;
 * takes no `this` because it never needed one.
 */
export function safeDecryptSecrets(
  ciphertext: Buffer,
  keyVersion: number,
  tenantId: string,
  provider: IntegrationProvider
): Record<string, string> | null {
  try {
    return decryptSecretBundle(ciphertext, keyVersion);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[TenantIntegrationService] failed to decrypt secretsCipher for tenant=${tenantId} provider=${provider}: ${
        (err as Error).message
      }`
    );
    return null;
  }
}

/** Builds the redacted `secretsMeta` (lastFour + savedAt only) persisted alongside the ciphertext. */
export function buildSecretsMeta(secrets: Record<string, string>): StoredSecretsMeta {
  const savedAt = new Date().toISOString();
  const meta: StoredSecretsMeta = {};
  for (const [field, value] of Object.entries(secrets)) {
    meta[field] = { lastFour: lastFour(value), savedAt };
  }
  return meta;
}
