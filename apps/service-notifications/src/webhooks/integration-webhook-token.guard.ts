import { UnauthorizedException } from "@nestjs/common";
import type { IntegrationProvider } from "@cobrai/db";
import type { AuditService } from "@cobrai/compliance";
import type { DecryptedIntegration, TenantIntegrationService } from "@cobrai/integrations";
import { validateTwilioSignature } from "./twilio-signature.validator";

/**
 * Single rejection message shared by every failure path in this guard
 * (unknown token, provider mismatch, missing signing secret, invalid
 * signature). One message for all of them is what makes the unknown-token
 * and invalid-signature responses byte-identical (T-08-13b, D-19's
 * anti-enumeration rule) — a caller probing tokens learns nothing about
 * whether a token exists or why a request was rejected.
 */
const WEBHOOK_REJECTED_MESSAGE = "Token de webhook o firma inválidos";

/**
 * Resolves the tenant integration for an opaque per-integration webhook
 * token (D-19), BEFORE any signature is checked — the token itself is what
 * lets the caller load the tenant's signing secret in the first place.
 *
 * Throws `UnauthorizedException` with the identical message for an unknown
 * token and for a token whose integration belongs to a different provider:
 * a caller must not be able to tell "no such token" apart from "wrong
 * provider" (T-08-13b).
 */
export async function resolveWebhookIntegration(
  integrations: TenantIntegrationService,
  provider: IntegrationProvider,
  token: string
): Promise<DecryptedIntegration> {
  const integration = await integrations.resolveByWebhookToken(token);
  if (!integration || integration.provider !== provider) {
    throw new UnauthorizedException(WEBHOOK_REJECTED_MESSAGE);
  }
  return integration;
}

/**
 * Verifies the Twilio `X-Twilio-Signature` header against the tenant's own
 * `authToken` secret (D-20, fail-closed).
 *
 * Deliberately runs in every environment — the previous controller code
 * only verified when `NODE_ENV === "production"`. An unverified webhook in
 * development is an unverified webhook in any environment that shares a
 * database with real debtor data, so that gate is removed entirely rather
 * than reproduced here.
 */
export async function assertTwilioSignature(input: {
  integration: DecryptedIntegration;
  webhookUrl: string;
  params: Record<string, string>;
  signature: string | undefined;
  audit: AuditService;
}): Promise<void> {
  const authToken = input.integration.secrets["authToken"];
  if (!authToken) {
    await input.audit.logAction({
      tenantId: input.integration.tenantId,
      action: "twilio_whatsapp.webhook_rejected_no_secret",
      resourceType: "tenant_integration",
      resourceId: input.integration.id
    });
    throw new UnauthorizedException(WEBHOOK_REJECTED_MESSAGE);
  }

  const valid = validateTwilioSignature(authToken, input.webhookUrl, input.params, input.signature ?? "");
  if (!valid) {
    await input.audit.logAction({
      tenantId: input.integration.tenantId,
      action: "twilio_whatsapp.webhook_rejected_invalid_signature",
      resourceType: "tenant_integration",
      resourceId: input.integration.id
    });
    throw new UnauthorizedException(WEBHOOK_REJECTED_MESSAGE);
  }
}
