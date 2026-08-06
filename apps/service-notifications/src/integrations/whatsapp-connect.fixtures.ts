import { vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { IntegrationView } from "@cobrai/integrations";

export const BASE_WEBHOOK_URL = "https://api.cobrai.dev/v1/webhooks";
export const SUBACCOUNT = { accountSid: "ACsubaccount0000000000000000000", authToken: "subaccount-secret-token" };
export const BYO_ACCOUNT_SID = "ACbyoaccount00000000000000000000";
export const BYO_AUTH_TOKEN = "byo-secret-token";

export function makeConfig(): ConfigService {
  return {
    get: vi.fn((key: string) => (key === "PUBLIC_WEBHOOK_BASE_URL" ? BASE_WEBHOOK_URL : undefined))
  } as unknown as ConfigService;
}

export function baseView(overrides: Partial<IntegrationView> = {}): IntegrationView {
  return {
    provider: "twilio_whatsapp",
    channel: "whatsapp",
    mode: "managed",
    status: "not_configured",
    verifiedAt: null,
    failureMessage: null,
    publicConfig: {},
    secrets: [],
    webhookUrl: `${BASE_WEBHOOK_URL}/twilio_whatsapp/tok-abc`,
    ...overrides
  };
}

export function makeCollaboratorMocks() {
  return {
    twilioProvisioning: {
      createSubaccount: vi.fn(),
      registerWhatsAppSender: vi.fn(),
      getSenderStatus: vi.fn()
    },
    vapiProvisioning: { importTwilioNumber: vi.fn(), releaseNumber: vi.fn() },
    tenantIntegrations: { upsert: vi.fn(), resolveAny: vi.fn() }
  };
}
