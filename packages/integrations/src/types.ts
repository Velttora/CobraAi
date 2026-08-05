import type {
  IntegrationProvider,
  IntegrationMode,
  IntegrationStatus
} from "@cobrai/db";

/** Communication/payment channel a provider belongs to. */
export type IntegrationChannel = "whatsapp" | "voice" | "email" | "payments";

/** Maps every provider to its single channel (D-01). */
export const PROVIDER_CHANNEL: Record<IntegrationProvider, IntegrationChannel> = {
  twilio_whatsapp: "whatsapp",
  twilio_voice: "voice",
  sendgrid: "email",
  stripe: "payments",
  wompi: "payments",
  payu: "payments",
  epayco: "payments",
  mercadopago: "payments",
  external_link: "payments",
  transfer: "payments"
};

/** Inverse of PROVIDER_CHANNEL: every provider available for a given channel. */
export const CHANNEL_PROVIDERS: Record<IntegrationChannel, IntegrationProvider[]> = (
  Object.entries(PROVIDER_CHANNEL) as [IntegrationProvider, IntegrationChannel][]
).reduce(
  (acc, [provider, channel]) => {
    acc[channel] = [...(acc[channel] ?? []), provider];
    return acc;
  },
  { whatsapp: [], voice: [], email: [], payments: [] } as Record<IntegrationChannel, IntegrationProvider[]>
);

/**
 * Providers that confirm payment via webhook. `external_link` and `transfer`
 * are deliberately excluded (D-14): those two have no provider to call back,
 * confirmation is manual reconciliation in the dashboard.
 */
export const WEBHOOK_CAPABLE_PROVIDERS: IntegrationProvider[] = [
  "stripe",
  "wompi",
  "payu",
  "epayco",
  "mercadopago",
  "twilio_whatsapp",
  "sendgrid"
];

/** Decrypted credential set resolved for a single (tenantId, provider) pair. Never serialize this directly. */
export interface DecryptedIntegration {
  id: string;
  tenantId: string;
  provider: IntegrationProvider;
  mode: IntegrationMode;
  status: IntegrationStatus;
  publicConfig: Record<string, string>;
  secrets: Record<string, string>;
  webhookToken: string | null;
  verifiedAt: Date | null;
}

/** Per-secret-field metadata persisted alongside the ciphertext; never the value itself. */
export interface SecretMeta {
  field: string;
  lastFour: string | null;
  savedAt: string | null;
}

/** Redacted shape returned by every API endpoint. Matches 08-UI-SPEC.md "Data Contract Consumed by the UI". */
export interface IntegrationView {
  provider: IntegrationProvider;
  channel: IntegrationChannel;
  mode: IntegrationMode;
  status: IntegrationStatus;
  verifiedAt: string | null;
  failureMessage: string | null;
  publicConfig: Record<string, string>;
  secrets: SecretMeta[];
  webhookUrl: string | null;
  dnsRecords?: { type: "CNAME"; host: string; value: string; verified: boolean }[];
}

/** Result of a provider health check, produced by `verifyCredentials`. */
export interface VerificationResult {
  ok: boolean;
  /** Provider message, shown verbatim in the UI failure block. Never contains a credential. */
  message?: string;
  /** Merged into publicConfig on success (e.g. resolved sender name, account friendly name). */
  publicConfig?: Record<string, string>;
  /** Overrides the persisted status when the provider reports an intermediate state. */
  status?: IntegrationStatus;
}
