import type { IntegrationView } from "../../../lib/types";

/**
 * Shared `IntegrationView` factory for `ChannelCard`'s test files (split
 * across several files per the 300-line file-size rule — each file still
 * mocks its own `@clerk/nextjs`/`next/navigation`/hooks locally, since a
 * `vi.mock` factory is scoped to the file that declares it).
 */
export function view(overrides: Partial<IntegrationView> = {}): IntegrationView {
  return {
    provider: "twilio_whatsapp",
    channel: "whatsapp",
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
