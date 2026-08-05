import { vi, describe, it, expect, beforeEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import twilio from "twilio";
import { assertTwilioSignature, resolveWebhookIntegration } from "./integration-webhook-token.guard";
import type { DecryptedIntegration } from "@cobrai/integrations";

const mockResolveByWebhookToken = vi.fn();
const mockIntegrations = { resolveByWebhookToken: mockResolveByWebhookToken };

const mockLogAction = vi.fn().mockResolvedValue(undefined);
const mockAudit = { logAction: mockLogAction };

function makeIntegration(overrides: Partial<DecryptedIntegration> = {}): DecryptedIntegration {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "tenant1",
    provider: "twilio_whatsapp",
    mode: "byo",
    status: "verified",
    publicConfig: {},
    secrets: { authToken: "tenant-auth-token" },
    webhookToken: "tok-abc",
    verifiedAt: new Date(),
    ...overrides
  };
}

describe("resolveWebhookIntegration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the integration for a valid token whose provider matches", async () => {
    const integration = makeIntegration();
    mockResolveByWebhookToken.mockResolvedValueOnce(integration);

    const result = await resolveWebhookIntegration(mockIntegrations as never, "twilio_whatsapp", "tok-abc");

    expect(result).toBe(integration);
  });

  it("throws UnauthorizedException for an unknown token", async () => {
    mockResolveByWebhookToken.mockResolvedValueOnce(null);

    await expect(resolveWebhookIntegration(mockIntegrations as never, "twilio_whatsapp", "unknown")).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("throws UnauthorizedException for a token whose integration is for a different provider", async () => {
    mockResolveByWebhookToken.mockResolvedValueOnce(makeIntegration({ provider: "sendgrid" }));

    await expect(resolveWebhookIntegration(mockIntegrations as never, "twilio_whatsapp", "tok-abc")).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("unknown token and provider mismatch produce the identical message", async () => {
    mockResolveByWebhookToken.mockResolvedValueOnce(null);
    const unknownError = await resolveWebhookIntegration(mockIntegrations as never, "twilio_whatsapp", "unknown").catch(
      (err: unknown) => err
    );

    mockResolveByWebhookToken.mockResolvedValueOnce(makeIntegration({ provider: "sendgrid" }));
    const mismatchError = await resolveWebhookIntegration(mockIntegrations as never, "twilio_whatsapp", "tok-abc").catch(
      (err: unknown) => err
    );

    expect((unknownError as UnauthorizedException).message).toBe((mismatchError as UnauthorizedException).message);
  });
});

describe("assertTwilioSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UnauthorizedException and audits webhook_rejected_no_secret when the integration has no authToken", async () => {
    const integration = makeIntegration({ secrets: {} });

    await expect(
      assertTwilioSignature({
        integration,
        webhookUrl: "https://api.cobrai.dev/v1/webhooks/twilio_whatsapp/tok-abc",
        params: {},
        signature: "sig",
        audit: mockAudit as never
      })
    ).rejects.toThrow(UnauthorizedException);

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: integration.tenantId,
        action: "twilio_whatsapp.webhook_rejected_no_secret"
      })
    );
  });

  it("throws and audits when the signature header is absent", async () => {
    const integration = makeIntegration();

    await expect(
      assertTwilioSignature({
        integration,
        webhookUrl: "https://api.cobrai.dev/v1/webhooks/twilio_whatsapp/tok-abc",
        params: {},
        signature: undefined,
        audit: mockAudit as never
      })
    ).rejects.toThrow(UnauthorizedException);

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "twilio_whatsapp.webhook_rejected_invalid_signature" })
    );
  });

  it("throws and audits when the signature does not validate", async () => {
    const integration = makeIntegration();

    await expect(
      assertTwilioSignature({
        integration,
        webhookUrl: "https://api.cobrai.dev/v1/webhooks/twilio_whatsapp/tok-abc",
        params: { Body: "hola" },
        signature: "not-a-valid-signature",
        audit: mockAudit as never
      })
    ).rejects.toThrow(UnauthorizedException);

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "twilio_whatsapp.webhook_rejected_invalid_signature" })
    );
  });

  it("resolves without throwing when the signature is valid", async () => {
    const authToken = "tenant-auth-token";
    const webhookUrl = "https://api.cobrai.dev/v1/webhooks/twilio_whatsapp/tok-abc";
    const params = { Body: "hola" };
    const signature = twilio.getExpectedTwilioSignature(authToken, webhookUrl, params);
    const integration = makeIntegration({ secrets: { authToken } });

    await expect(
      assertTwilioSignature({ integration, webhookUrl, params, signature, audit: mockAudit as never })
    ).resolves.toBeUndefined();

    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it("still throws for an invalid signature with NODE_ENV=development (no environment gate)", async () => {
    const original = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    const integration = makeIntegration();

    try {
      await expect(
        assertTwilioSignature({
          integration,
          webhookUrl: "https://api.cobrai.dev/v1/webhooks/twilio_whatsapp/tok-abc",
          params: { Body: "hola" },
          signature: "bad-signature",
          audit: mockAudit as never
        })
      ).rejects.toThrow(UnauthorizedException);
    } finally {
      process.env["NODE_ENV"] = original;
    }
  });

  it("unknown-token rejection and invalid-signature rejection are byte-identical", async () => {
    mockResolveByWebhookToken.mockResolvedValueOnce(null);
    const unknownTokenError = await resolveWebhookIntegration(mockIntegrations as never, "twilio_whatsapp", "unknown").catch(
      (err: unknown) => err
    );

    const integration = makeIntegration();
    const invalidSignatureError = await assertTwilioSignature({
      integration,
      webhookUrl: "https://api.cobrai.dev/v1/webhooks/twilio_whatsapp/tok-abc",
      params: { Body: "hola" },
      signature: "bad-signature",
      audit: mockAudit as never
    }).catch((err: unknown) => err);

    expect(unknownTokenError).toBeInstanceOf(UnauthorizedException);
    expect(invalidSignatureError).toBeInstanceOf(UnauthorizedException);
    expect((unknownTokenError as UnauthorizedException).getStatus()).toBe(
      (invalidSignatureError as UnauthorizedException).getStatus()
    );
    expect((unknownTokenError as UnauthorizedException).message).toBe(
      (invalidSignatureError as UnauthorizedException).message
    );
  });
});
