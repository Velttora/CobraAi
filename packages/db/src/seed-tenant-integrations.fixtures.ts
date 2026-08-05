import { vi } from "vitest";

/** Deterministic 32-byte key so tests never depend on a real deployment secret. */
export const TEST_KEY_V1 = Buffer.alloc(32, 9).toString("base64");

/**
 * Sets (or deletes, for `undefined`) each `process.env` var and returns a
 * function that restores every var to its original value.
 */
export function withEnv(vars: Record<string, string | undefined>): () => void {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    originals[key] = process.env[key];
    const value = vars[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const key of Object.keys(originals)) {
      const original = originals[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  };
}

/** Installs `ENCRYPTION_KEY_V1` for the duration of a test and returns a restore function. */
export function withTestEncryptionKey(): () => void {
  return withEnv({ ENCRYPTION_KEY_V1: TEST_KEY_V1 });
}

/** Shape of the hand-rolled Prisma mock, spelled out to keep declaration output portable. */
export interface SeedPrismaMock {
  tenant: { findMany: ReturnType<typeof vi.fn> };
  tenantIntegration: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
}

/** Hand-rolled Prisma mock covering only what `seed-tenant-integrations.ts` calls. */
export function makePrismaMock(): SeedPrismaMock {
  return {
    tenant: {
      findMany: vi.fn()
    },
    tenantIntegration: {
      findUnique: vi.fn(),
      create: vi.fn()
    }
  };
}

export function buildTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant-1",
    settings: {},
    ...overrides
  };
}
