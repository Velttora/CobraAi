import { randomBytes } from "node:crypto";
import { encryptSecretBundle } from "@cobrai/utils/crypto";
import type { IntegrationMode, IntegrationProvider, IntegrationStatus, PrismaService, TenantIntegration } from "@cobrai/db";
import { CHANNEL_PROVIDERS, PROVIDER_CHANNEL, WEBHOOK_CAPABLE_PROVIDERS } from "./types";
import type { DecryptedIntegration, IntegrationChannel, IntegrationView, SecretMeta } from "./types";
import { verifyCredentials } from "./verifiers";
import { CredentialCache } from "./credential-cache";
import { buildSecretsMeta, safeDecryptSecrets } from "./secrets-codec";
import type { StoredSecretsMeta } from "./secrets-codec";


export interface UpsertIntegrationInput {
  tenantId: string;
  provider: IntegrationProvider;
  mode: IntegrationMode;
  publicConfig: Record<string, string>;
  secrets: Record<string, string>;
  /**
   * Bypasses `verifyCredentials`. Used for `external_link`/`transfer`, which have no
   * provider to verify against — the row is marked verified directly so `resolve`
   * still gates on `status === "verified"` for these providers.
   */
  skipVerification?: boolean;
  /**
   * Bypasses both `verifyCredentials` and the `skipVerification` shortcut,
   * writing an exact status/failureMessage/verifiedAt directly. Used by
   * orchestrators (e.g. `WhatsAppConnectService`, plan 08-07) that compute
   * status from a provider-specific state machine — a Twilio Channels
   * Sender's `CREATING`/`OFFLINE`/`VERIFYING`/`ONLINE` progression, or a
   * downstream provisioning step's own success/failure (e.g. the Vapi
   * number import backing `twilio_voice`) — rather than the generic
   * account-level health check `verifyCredentials` runs.
   */
  overrideStatus?: { status: IntegrationStatus; failureMessage?: string | null; verifiedAt?: Date | null };
  /** Base URL used by `toView` to build the per-integration webhook URL. */
  baseWebhookUrl: string;
}

/**
 * The single place that turns `(tenantId, provider)` into usable credentials
 * (D-01). Generalizes the per-tenant, per-call resolution pattern from
 * `resolveFrom()` in `twilio-whatsapp.adapter.ts` to every channel and
 * provider, gated on verification status (D-11) and cached with a short TTL
 * keyed by tenant so credentials never leak across tenants (T-08-03b).
 *
 * Plain class, no NestJS dependency — each app wires this with a factory
 * provider, following the `packages/compliance` precedent.
 */
export class TenantIntegrationService {
  private readonly cache: CredentialCache;

  constructor(
    private readonly prisma: PrismaService,
    ttlMs = 30_000
  ) {
    this.cache = new CredentialCache(ttlMs);
  }

  /**
   * Resolves the decrypted credential set for `(tenantId, provider)`, or
   * `null` when the row is missing, soft-deleted, not verified, or its
   * ciphertext fails to decrypt (T-08-03, T-08-03e). Negative results are
   * cached too, so an unconfigured channel does not hit Prisma on every send.
   */
  async resolve(tenantId: string, provider: IntegrationProvider): Promise<DecryptedIntegration | null> {
    const cached = this.cache.get(tenantId, provider);
    if (cached !== undefined) return cached;

    const row = await this.prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId, provider } }
    });

    const value = this.decryptRowIfVerified(row as TenantIntegration | null);
    this.cache.set(tenantId, provider, value);
    return value;
  }

  /** Maps `channel` through `CHANNEL_PROVIDERS` and returns the first verified provider row for it. */
  async resolveByChannel(tenantId: string, channel: IntegrationChannel): Promise<DecryptedIntegration | null> {
    for (const provider of CHANNEL_PROVIDERS[channel]) {
      const result = await this.resolve(tenantId, provider);
      if (result) return result;
    }
    return null;
  }

  /** Counts verified, non-deleted rows for the channel's providers without decrypting anything. */
  async hasVerifiedChannel(tenantId: string, channel: IntegrationChannel): Promise<boolean> {
    const count = await this.prisma.tenantIntegration.count({
      where: {
        tenantId,
        provider: { in: CHANNEL_PROVIDERS[channel] },
        status: "verified",
        deletedAt: null
      }
    });
    return count > 0;
  }

  /**
   * Webhook routing (D-19). Returns the row regardless of status — unlike
   * `resolve`, so downstream fail-closed logic (D-20) can tell "no signing
   * secret configured" apart from "no such tenant". Not cached: webhook
   * traffic is low-volume relative to sends and caching by token would need
   * its own invalidation path.
   */
  async resolveByWebhookToken(token: string): Promise<DecryptedIntegration | null> {
    const row = await this.prisma.tenantIntegration.findFirst({
      where: { webhookToken: token, deletedAt: null }
    });
    if (!row) return null;
    return this.decryptRow(row as TenantIntegration);
  }

  /**
   * Resolves the decrypted credential set for `(tenantId, provider)`
   * regardless of `status` — unlike `resolve`, which gates on `verified`.
   * Needed by orchestrators that must re-read a row sitting in an
   * intermediate state (e.g. `pending_meta`) to poll a provider for its
   * current status (plan 08-07's `WhatsAppConnectService.refreshSenderStatus`).
   * Not cached, like `resolveByWebhookToken`: this path is low-volume
   * (status-refresh polling), not the per-send hot path `resolve` serves.
   */
  async resolveAny(tenantId: string, provider: IntegrationProvider): Promise<DecryptedIntegration | null> {
    const row = await this.prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId, provider } }
    });
    if (!row || (row as TenantIntegration).deletedAt) return null;
    return this.decryptRow(row as TenantIntegration);
  }

  /**
   * Saves (creates or rotates) a tenant's credentials for `provider`. Runs a
   * live verification (D-11) unless `skipVerification` is set, encrypts the
   * merged secret bundle, and never persists a plaintext value outside
   * `secretsCipher`.
   */
  async upsert(input: UpsertIntegrationInput): Promise<IntegrationView> {
    const existing = (await this.prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId: input.tenantId, provider: input.provider } }
    })) as TenantIntegration | null;

    const existingSecrets =
      existing?.secretsCipher && !existing.deletedAt
        ? (safeDecryptSecrets(existing.secretsCipher as Buffer, existing.keyVersion, existing.tenantId, input.provider) ??
          {})
        : {};
    // Rotation is per-field: an unsent field keeps its previously stored value.
    const mergedSecrets = { ...existingSecrets, ...input.secrets };

    let status: TenantIntegration["status"];
    let failureMessage: string | null;
    let verifiedAt: Date | null;
    let publicConfig = input.publicConfig;

    if (input.overrideStatus) {
      status = input.overrideStatus.status;
      failureMessage = input.overrideStatus.failureMessage ?? null;
      verifiedAt =
        input.overrideStatus.verifiedAt ?? (status === "verified" ? new Date() : (existing?.verifiedAt ?? null));
    } else if (input.skipVerification) {
      status = "verified";
      failureMessage = null;
      verifiedAt = new Date();
    } else {
      const verification = await verifyCredentials(input.provider, {
        publicConfig: input.publicConfig,
        secrets: mergedSecrets
      });
      if (verification.publicConfig) {
        publicConfig = { ...input.publicConfig, ...verification.publicConfig };
      }
      status = verification.status ?? (verification.ok ? "verified" : "failed");
      failureMessage = verification.ok ? null : (verification.message ?? null);
      verifiedAt = verification.ok ? new Date() : (existing?.verifiedAt ?? null);
    }

    const { ciphertext, keyVersion } = encryptSecretBundle(mergedSecrets);
    const secretsMeta = buildSecretsMeta(mergedSecrets);

    const webhookToken =
      existing?.webhookToken ??
      (WEBHOOK_CAPABLE_PROVIDERS.includes(input.provider) ? randomBytes(32).toString("base64url") : null);

    const data = {
      tenantId: input.tenantId,
      provider: input.provider,
      mode: input.mode,
      status,
      publicConfig,
      secretsCipher: ciphertext,
      secretsMeta,
      keyVersion,
      webhookToken,
      verifiedAt,
      failureMessage,
      deletedAt: null
    };

    const row = (await this.prisma.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId: input.tenantId, provider: input.provider } },
      create: data,
      update: data
    })) as TenantIntegration;

    this.invalidate(input.tenantId, input.provider);
    return this.toView(row, input.baseWebhookUrl);
  }

  /** Soft-deletes the integration, wiping the ciphertext and metadata, and invalidates the cache. */
  async disconnect(tenantId: string, provider: IntegrationProvider): Promise<void> {
    await this.prisma.tenantIntegration.update({
      where: { tenantId_provider: { tenantId, provider } },
      data: {
        deletedAt: new Date(),
        status: "not_configured",
        secretsCipher: null,
        secretsMeta: {}
      }
    });
    this.invalidate(tenantId, provider);
  }

  /** Redacted views of every non-deleted integration for a tenant. The only serialization path any controller should use. */
  async listViews(tenantId: string, baseWebhookUrl: string): Promise<IntegrationView[]> {
    const rows = (await this.prisma.tenantIntegration.findMany({
      where: { tenantId, deletedAt: null }
    })) as TenantIntegration[];
    return rows.map((row) => this.toView(row, baseWebhookUrl));
  }

  /**
   * Builds the redacted `IntegrationView` from a raw row. `secrets` is
   * derived from `secretsMeta` only — it is structurally impossible for this
   * method to emit a plaintext secret (D-26, T-08-03c).
   */
  toView(row: TenantIntegration, baseWebhookUrl: string): IntegrationView {
    const storedMeta = (row.secretsMeta ?? {}) as StoredSecretsMeta;
    const secrets: SecretMeta[] = Object.entries(storedMeta).map(([field, meta]) => ({
      field,
      lastFour: meta.lastFour ?? null,
      savedAt: meta.savedAt ?? null
    }));

    const isWebhookCapable = WEBHOOK_CAPABLE_PROVIDERS.includes(row.provider);
    const webhookUrl =
      row.webhookToken && isWebhookCapable ? `${baseWebhookUrl}/${row.provider}/${row.webhookToken}` : null;

    const publicConfig = (row.publicConfig ?? {}) as Record<string, string> & {
      dnsRecords?: { type: "CNAME"; host: string; value: string; verified: boolean }[];
    };

    return {
      provider: row.provider,
      channel: PROVIDER_CHANNEL[row.provider],
      mode: row.mode,
      status: row.status,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      failureMessage: row.failureMessage ?? null,
      publicConfig,
      secrets,
      webhookUrl,
      ...(publicConfig.dnsRecords ? { dnsRecords: publicConfig.dnsRecords } : {})
    };
  }

  /** Evicts the cache entry for `(tenantId, provider)`, forcing the next `resolve` to hit Prisma. */
  invalidate(tenantId: string, provider: IntegrationProvider): void {
    this.cache.delete(tenantId, provider);
  }

  private decryptRowIfVerified(row: TenantIntegration | null): DecryptedIntegration | null {
    if (!row || row.deletedAt || row.status !== "verified") return null;
    return this.decryptRow(row);
  }

  private decryptRow(row: TenantIntegration): DecryptedIntegration | null {
    if (!row.secretsCipher) return null;
    const secrets = safeDecryptSecrets(row.secretsCipher as Buffer, row.keyVersion, row.tenantId, row.provider);
    if (!secrets) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      provider: row.provider,
      mode: row.mode,
      status: row.status,
      publicConfig: (row.publicConfig ?? {}) as Record<string, string>,
      secrets,
      webhookToken: row.webhookToken,
      verifiedAt: row.verifiedAt
    };
  }
}
