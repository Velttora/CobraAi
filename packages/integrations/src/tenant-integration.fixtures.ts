import { vi } from "vitest";
import { encryptSecretBundle } from "@cobrai/utils";
import type { IntegrationProvider, IntegrationStatus } from "@cobrai/db";

/** Deterministic 32-byte key so ciphertext is reproducible across specs. */
export const TEST_KEY_V1 = Buffer.alloc(32, 7).toString("base64");

export const BASE_WEBHOOK_URL = "https://api.cobrai.dev/webhooks";

/**
 * Builds a persisted TenantIntegration row with real ciphertext. Pass
 * `secretsPlain` to control what gets encrypted; any other key overrides the
 * column directly.
 */
export function buildRow(overrides: Record<string, unknown> = {}) {
  const secrets = (overrides["secretsPlain"] as Record<string, string> | undefined) ?? {
    apiKey: "sk_live_abcd1234"
  };
  const { ciphertext, keyVersion } = encryptSecretBundle(secrets, 1);
  const { secretsPlain: _drop, ...rest } = overrides;
  return {
    id: "row-1",
    tenantId: "tenantA",
    provider: "sendgrid" as IntegrationProvider,
    mode: "byo",
    status: "verified" as IntegrationStatus,
    publicConfig: { domain: "example.com" },
    secretsCipher: ciphertext,
    secretsMeta: { apiKey: { lastFour: "1234", savedAt: "2026-01-01T00:00:00.000Z" } },
    keyVersion,
    webhookToken: null,
    verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    failureMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...rest
  };
}

export function makePrismaMock() {
  return {
    tenantIntegration: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn()
    }
  };
}

/** Installs the test encryption key and returns a restore function. */
export function withTestEncryptionKey() {
  const original = process.env["ENCRYPTION_KEY_V1"];
  process.env["ENCRYPTION_KEY_V1"] = TEST_KEY_V1;
  return () => {
    if (original === undefined) delete process.env["ENCRYPTION_KEY_V1"];
    else process.env["ENCRYPTION_KEY_V1"] = original;
  };
}
