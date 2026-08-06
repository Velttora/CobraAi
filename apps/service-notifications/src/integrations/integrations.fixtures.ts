import { vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { IntegrationView } from "@cobrai/integrations";

export const BASE_WEBHOOK_URL = "https://api.cobrai.dev/v1/webhooks";

export function makeConfig(): ConfigService {
  return {
    get: vi.fn((key: string) => (key === "PUBLIC_WEBHOOK_BASE_URL" ? BASE_WEBHOOK_URL : undefined))
  } as unknown as ConfigService;
}

export function baseView(overrides: Partial<IntegrationView> = {}): IntegrationView {
  return {
    provider: "stripe",
    channel: "payments",
    mode: "byo",
    status: "not_configured",
    verifiedAt: null,
    failureMessage: null,
    publicConfig: {},
    secrets: [],
    webhookUrl: null,
    ...overrides
  };
}

/** Mocked collaborators for `IntegrationsService`, one `vi.fn()` per method actually called. */
export function makeCollaboratorMocks() {
  return {
    tenantIntegrations: {
      listViews: vi.fn(),
      upsert: vi.fn(),
      disconnect: vi.fn(),
      resolveAny: vi.fn()
    },
    whatsappConnect: {
      connectManaged: vi.fn(),
      connectByo: vi.fn(),
      refreshSenderStatus: vi.fn()
    },
    emailConnect: {
      connectManaged: vi.fn(),
      connectByo: vi.fn(),
      recheckDns: vi.fn()
    },
    prisma: {
      $queryRaw: vi.fn()
    }
  };
}
