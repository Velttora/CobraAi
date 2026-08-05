import { vi, describe, it, expect, beforeEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import twilio from "twilio";
import { WebhooksController } from "./webhooks.controller";
import type { DecryptedIntegration } from "@cobrai/integrations";

const BASE_URL = "https://api.cobrai.dev/v1/webhooks";
const AUTH_TOKEN = "tenant-auth-token";

const mockResolveByWebhookToken = vi.fn();
const mockIntegrations = { resolveByWebhookToken: mockResolveByWebhookToken };

const mockLogAction = vi.fn().mockResolvedValue(undefined);
const mockAudit = { logAction: mockLogAction };

const mockConfig = { get: vi.fn(() => BASE_URL) };

const mockTwilioWaHandleInbound = vi.fn().mockResolvedValue(undefined);
const mockTwilioWaHandler = { handleInbound: mockTwilioWaHandleInbound };

const mockSendgridHandleInbound = vi.fn().mockResolvedValue(undefined);
const mockSendgridHandler = { handleInbound: mockSendgridHandleInbound };

const mockVapiHandleEndOfCall = vi.fn().mockResolvedValue(undefined);
const mockVapiHandler = { handleEndOfCall: mockVapiHandleEndOfCall };

const mockWebhooksService = {
  handleSendGrid: vi.fn(),
  handleTwilio: vi.fn(),
  handleWhatsApp: vi.fn()
};

function makeIntegration(overrides: Partial<DecryptedIntegration> = {}): DecryptedIntegration {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "tenant1",
    provider: "twilio_whatsapp",
    mode: "byo",
    status: "verified",
    publicConfig: {},
    secrets: { authToken: AUTH_TOKEN },
    webhookToken: "tok-abc",
    verifiedAt: new Date(),
    ...overrides
  };
}

function buildController(): WebhooksController {
  return new WebhooksController(
    mockWebhooksService as never,
    mockTwilioWaHandler as never,
    mockVapiHandler as never,
    mockSendgridHandler as never,
    mockIntegrations as never,
    mockAudit as never,
    mockConfig as never
  );
}

describe("WebhooksController — token-routed channel webhooks", () => {
  let controller: WebhooksController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.get.mockReturnValue(BASE_URL);
    controller = buildController();
  });

  it("POST twilio_whatsapp/:token con token y firma válidos llama al handler con el tenantId resuelto", async () => {
    const integration = makeIntegration();
    mockResolveByWebhookToken.mockResolvedValueOnce(integration);
    const webhookUrl = `${BASE_URL}/twilio_whatsapp/tok-abc`;
    const params = { Body: "hola" };
    const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, webhookUrl, params);

    const result = await controller.twilioWhatsApp("tok-abc", params, signature);

    expect(mockTwilioWaHandleInbound).toHaveBeenCalledWith("tenant1", params);
    expect(result).toBe("");
  });

  it("POST sendgrid/:token con token válido llama al handler con el tenantId y replyDomain resueltos", async () => {
    const integration = makeIntegration({
      provider: "sendgrid",
      publicConfig: { replyDomain: "reply.acme.com" }
    });
    mockResolveByWebhookToken.mockResolvedValueOnce(integration);
    const body = { from: "juan@test.com", to: "abc@reply.acme.com" };

    const result = await controller.sendgridInbound("tok-xyz", body);

    expect(mockSendgridHandleInbound).toHaveBeenCalledWith("tenant1", "reply.acme.com", body);
    expect(result).toBe("");
  });

  it("POST vapi no cambia: sin token, sin resolución de integración, devuelve { received: true }", async () => {
    const result = await controller.vapiWebhook({ message: { type: "status-update" } } as never);

    expect(mockResolveByWebhookToken).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });

  it("token desconocido en twilio_whatsapp → UnauthorizedException, no llama al handler", async () => {
    mockResolveByWebhookToken.mockResolvedValueOnce(null);

    await expect(controller.twilioWhatsApp("unknown", {}, "sig")).rejects.toThrow(UnauthorizedException);
    expect(mockTwilioWaHandleInbound).not.toHaveBeenCalled();
  });

  it("verificación de firma corre también con NODE_ENV=development (sin gate de ambiente)", async () => {
    const original = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    mockResolveByWebhookToken.mockResolvedValueOnce(makeIntegration());

    try {
      await expect(controller.twilioWhatsApp("tok-abc", { Body: "hola" }, "invalid-signature")).rejects.toThrow(
        UnauthorizedException
      );
      expect(mockTwilioWaHandleInbound).not.toHaveBeenCalled();
    } finally {
      process.env["NODE_ENV"] = original;
    }
  });

  it("token desconocido e firma inválida producen respuestas byte-idénticas", async () => {
    mockResolveByWebhookToken.mockResolvedValueOnce(null);
    const unknownTokenError = await controller.twilioWhatsApp("unknown", {}, "sig").catch((err: unknown) => err);

    mockResolveByWebhookToken.mockResolvedValueOnce(makeIntegration());
    const invalidSignatureError = await controller
      .twilioWhatsApp("tok-abc", { Body: "hola" }, "invalid-signature")
      .catch((err: unknown) => err);

    expect(unknownTokenError).toBeInstanceOf(UnauthorizedException);
    expect(invalidSignatureError).toBeInstanceOf(UnauthorizedException);
    expect((unknownTokenError as UnauthorizedException).getResponse()).toEqual(
      (invalidSignatureError as UnauthorizedException).getResponse()
    );
  });
});
