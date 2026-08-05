import type { DecryptedIntegration } from "./types";

interface CacheEntry {
  value: DecryptedIntegration | null;
  expiresAt: number;
}

/**
 * Short-lived cache of decrypted credentials, keyed by `(tenantId, provider)`
 * so a value can never be served to the wrong tenant.
 *
 * Expiry here means *deletion*, not just staleness. An entry past its TTL still
 * holds plaintext secrets, so leaving it in the map until someone happens to
 * ask for that key again would retain every credential the process ever
 * resolved, for the process's lifetime — an unbounded leak in a multi-tenant
 * service, and a direct weakening of the property this package exists to
 * provide: a heap dump should not expose credentials that stopped being needed
 * minutes ago.
 *
 * Sweeping runs on every write. The live set is bounded by the tenants that
 * actually sent something inside one TTL window, so the scan stays small, and
 * paying it is cheaper than being wrong about how long plaintext lives.
 */
export class CredentialCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number) {}

  private static key(tenantId: string, provider: string): string {
    return `${tenantId}:${provider}`;
  }

  /** Returns the cached value, or `undefined` when absent or expired. */
  get(tenantId: string, provider: string): DecryptedIntegration | null | undefined {
    const cacheKey = CredentialCache.key(tenantId, provider);
    const entry = this.entries.get(cacheKey);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(cacheKey);
      return undefined;
    }
    return entry.value;
  }

  set(tenantId: string, provider: string, value: DecryptedIntegration | null): void {
    this.sweep();
    this.entries.set(CredentialCache.key(tenantId, provider), {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  delete(tenantId: string, provider: string): void {
    this.entries.delete(CredentialCache.key(tenantId, provider));
  }

  /** Live entry count. Exposed for tests asserting the cache stays bounded. */
  get size(): number {
    return this.entries.size;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
