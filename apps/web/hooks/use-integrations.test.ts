import { describe, it, expect } from "vitest";

// Smoke tests for use-integrations' exported types — the hooks themselves
// wrap React Query + axios and are exercised end-to-end by the four screen
// plans (08-17 through 08-19); this file follows the same
// types-only-smoke-test precedent as use-conversations.test.ts.

import type { IntegrationSecretMeta, IntegrationView, SaveIntegrationInput } from "../lib/types";

describe("use-integrations types", () => {
  it("IntegrationView shape carries lastFour only, never a plaintext secret", () => {
    const secretMeta: IntegrationSecretMeta = {
      field: "authToken",
      lastFour: "4242",
      savedAt: "2026-08-01T10:00:00Z"
    };
    const view: IntegrationView = {
      provider: "twilio_whatsapp",
      channel: "whatsapp",
      mode: "byo",
      status: "verified",
      verifiedAt: "2026-08-01T10:00:00Z",
      failureMessage: null,
      publicConfig: { phoneNumberE164: "+573001234567" },
      secrets: [secretMeta],
      webhookUrl: null
    };

    expect(view.secrets[0]?.lastFour).toBe("4242");
    // Structural proof: IntegrationSecretMeta has no field capable of
    // carrying a plaintext value.
    expect(Object.keys(secretMeta).sort()).toEqual(["field", "lastFour", "savedAt"]);
  });

  it("SaveIntegrationInput is a distinct request type carrying raw secrets", () => {
    const input: SaveIntegrationInput = {
      mode: "byo",
      publicConfig: { accountSid: "AC123" },
      secrets: { authToken: "typed-in-this-session-only" }
    };

    expect(input.secrets?.authToken).toBe("typed-in-this-session-only");
  });
});
