import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DecryptedIntegration } from "@cobrai/integrations";
import { WebhooksController } from "./webhooks.controller";
import { WEBHOOK_UNAUTHORIZED_MESSAGE } from "./webhook-validator.service";

function buildIntegration(overrides: Partial<DecryptedIntegration> = {}): DecryptedIntegration {
  return {
    id: "integration-1",
    tenantId: "tenant-1",
    provider: "stripe",
    mode: "byo",
    status: "verified",
    publicConfig: {},
    secrets: { webhookSecret: "s" },
    webhookToken: "real-token",
    verifiedAt: new Date(),
    ...overrides
  } as DecryptedIntegration;
}

function buildController(overrides: {
  resolveByWebhookToken?: ReturnType<typeof vi.fn>;
  verify?: ReturnType<typeof vi.fn>;
  handle?: ReturnType<typeof vi.fn>;
} = {}) {
  const tenantIntegrations = { resolveByWebhookToken: overrides.resolveByWebhookToken ?? vi.fn().mockResolvedValue(null) };
  const validator = { verify: overrides.verify ?? vi.fn().mockResolvedValue(undefined) };
  const webhooks = { handle: overrides.handle ?? vi.fn().mockResolvedValue(undefined) };
  const controller = new WebhooksController(tenantIntegrations as never, validator as never, webhooks as never);
  return { controller, tenantIntegrations, validator, webhooks };
}

function buildRequest(rawBody = "{}", headers: Record<string, string> = {}) {
  return { rawBody: Buffer.from(rawBody), headers } as never;
}

async function capture(promise: Promise<unknown>): Promise<{ status: number; body: string }> {
  try {
    await promise;
    throw new Error("expected the handler to throw");
  } catch (err) {
    const ex = err as UnauthorizedException;
    return { status: ex.getStatus(), body: JSON.stringify(ex.getResponse()) };
  }
}

describe("WebhooksController", () => {
  it("confirms and returns 200 on a valid token and a valid signature", async () => {
    const integration = buildIntegration();
    const { controller, validator, webhooks } = buildController({
      resolveByWebhookToken: vi.fn().mockResolvedValue(integration)
    });

    const result = await controller.handle("stripe", "real-token", buildRequest());

    expect(result.data).toEqual({ received: true });
    expect(validator.verify).toHaveBeenCalledWith(expect.objectContaining({ provider: "stripe", integration }));
    expect(webhooks.handle).toHaveBeenCalledWith(integration, "{}");
  });

  it("resolves the tenant by token BEFORE calling the signature validator", async () => {
    const integration = buildIntegration();
    const order: string[] = [];
    const resolveByWebhookToken = vi.fn().mockImplementation(async () => {
      order.push("resolve");
      return integration;
    });
    const verify = vi.fn().mockImplementation(async () => {
      order.push("verify");
    });
    const { controller } = buildController({ resolveByWebhookToken, verify });

    await controller.handle("stripe", "real-token", buildRequest());

    expect(order).toEqual(["resolve", "verify"]);
  });

  it("rejects an unknown provider path segment without querying the database", async () => {
    const resolveByWebhookToken = vi.fn();
    const { controller } = buildController({ resolveByWebhookToken });

    await expect(controller.handle("not-a-provider", "any-token", buildRequest())).rejects.toThrow(UnauthorizedException);
    expect(resolveByWebhookToken).not.toHaveBeenCalled();
  });

  it("rejects when the resolved integration's provider does not match the path segment", async () => {
    const integration = buildIntegration({ provider: "mercadopago" });
    const { controller } = buildController({ resolveByWebhookToken: vi.fn().mockResolvedValue(integration) });

    await expect(controller.handle("stripe", "real-token", buildRequest())).rejects.toThrow(UnauthorizedException);
  });

  it("byte-identical response: unknown token vs. known token with an invalid signature (T-08-07b, D-19)", async () => {
    const unknownTokenController = buildController({ resolveByWebhookToken: vi.fn().mockResolvedValue(null) });
    const unknownTokenResponse = await capture(
      unknownTokenController.controller.handle("stripe", "unknown-token", buildRequest())
    );

    const integration = buildIntegration();
    const badSignatureController = buildController({
      resolveByWebhookToken: vi.fn().mockResolvedValue(integration),
      verify: vi.fn().mockRejectedValue(new UnauthorizedException(WEBHOOK_UNAUTHORIZED_MESSAGE))
    });
    const badSignatureResponse = await capture(
      badSignatureController.controller.handle("stripe", "real-token", buildRequest())
    );

    expect(unknownTokenResponse).toEqual(badSignatureResponse);
  });

  it("byte-identical response: unknown provider vs. unknown token (D-19)", async () => {
    const unknownProviderController = buildController();
    const unknownProviderResponse = await capture(
      unknownProviderController.controller.handle("not-a-provider", "any-token", buildRequest())
    );

    const unknownTokenController = buildController({ resolveByWebhookToken: vi.fn().mockResolvedValue(null) });
    const unknownTokenResponse = await capture(
      unknownTokenController.controller.handle("stripe", "unknown-token", buildRequest())
    );

    expect(unknownProviderResponse).toEqual(unknownTokenResponse);
  });

  it("passes the raw, unparsed request body to the validator, not a re-serialized copy", async () => {
    const integration = buildIntegration();
    const { controller, validator } = buildController({ resolveByWebhookToken: vi.fn().mockResolvedValue(integration) });
    const rawBody = '{"a": 1,   "b": 2}'; // deliberately non-canonical spacing

    await controller.handle("stripe", "real-token", buildRequest(rawBody));

    expect(validator.verify).toHaveBeenCalledWith(expect.objectContaining({ rawBody }));
  });
});
