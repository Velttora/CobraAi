import { BadRequestException } from "@nestjs/common";
import type { IntegrationMode, IntegrationProvider } from "@cobrai/db";
import { PROVIDER_CHANNEL } from "@cobrai/integrations";
import type { IntegrationView } from "@cobrai/integrations";

/** Every provider the tenant could configure, in `IntegrationProvider` enum order. */
export const ALL_PROVIDERS = Object.keys(PROVIDER_CHANNEL) as IntegrationProvider[];

/**
 * `service-notifications` has no dependency on `apps/api-gateway`, so this is
 * a local port of `normalizeClerkRole` (`apps/api-gateway/src/common/types/clerk-request.ts`)
 * rather than a cross-app import. By the time a role reaches here it has
 * already been normalized once by the gateway's `ClerkAuthGuard` and forwarded
 * as `x-user-role`, but this service must not trust that upstream step blindly
 * (T-08-14b) — it re-normalizes defensively in case it is ever called with a
 * raw `org:admin`-shaped role.
 */
export function normalizeClerkRole(role?: string): string {
  if (!role) {
    return "viewer";
  }
  return role.replace(/^org:/, "");
}

/** Throws `BadRequestException` for any string outside the `IntegrationProvider` enum (D-16 UI needs a clean 400, not a Prisma crash). */
export function assertValidProvider(provider: string): IntegrationProvider {
  if (!ALL_PROVIDERS.includes(provider as IntegrationProvider)) {
    throw new BadRequestException(`Proveedor de integración desconocido: ${provider}`);
  }
  return provider as IntegrationProvider;
}

/** Payments are BYO-only (D-06) — every other channel defaults to `managed` (D-01), matching the UI's pre-selected pill for an unconfigured channel. */
export function defaultModeFor(provider: IntegrationProvider): IntegrationMode {
  return PROVIDER_CHANNEL[provider] === "payments" ? "byo" : "managed";
}

/** Synthesizes the `not_configured` view for a provider with no persisted row, so the UI always gets one card per provider (D-24 Screen 1/2). */
export function notConfiguredView(provider: IntegrationProvider): IntegrationView {
  return {
    provider,
    channel: PROVIDER_CHANNEL[provider],
    mode: defaultModeFor(provider),
    status: "not_configured",
    verifiedAt: null,
    failureMessage: null,
    publicConfig: {},
    secrets: [],
    webhookUrl: null
  };
}
