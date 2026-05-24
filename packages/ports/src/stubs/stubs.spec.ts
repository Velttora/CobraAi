import { describe, expect, it } from "vitest";
import { AIScoringStubAdapter } from "./ai-scoring.stub";
import { VoiceAgentStubAdapter } from "./voice-agent.stub";
import { WhatsAppStubAdapter } from "./whatsapp.stub";

describe("AIScoringStubAdapter", () => {
  it("returns score in 0-100 with required fields", async () => {
    const adapter = new AIScoringStubAdapter();
    const result = await adapter.scoreDebt({
      debt_id: "debt-1",
      tenant_id: "tenant-1",
      features: {
        aging_days: 90,
        amount: 1_000_000,
        amount_outstanding: 800_000,
        has_whatsapp: true,
        has_phone: true,
        has_email: false,
        promises_broken_count: 2,
        previous_contacts_count: 5
      }
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.model_version).toMatch(/^stub-/);
    expect(result.best_channel).toBe("whatsapp");
  });
});

describe("VoiceAgentStubAdapter", () => {
  it("queues call and resolves status", async () => {
    const adapter = new VoiceAgentStubAdapter();
    const { call_id, status } = await adapter.initiateCall({
      debt_id: "debt-1",
      debtor_phone: "+573001234567",
      strategy_context: {
        tenant_id: "tenant-1",
        strategy_id: "strategy-1",
        language: "es",
        segment: "high",
        preferred_channel: "voice",
        variables: { debtor_name: "Test" }
      }
    });

    expect(status).toBe("queued");
    const callStatus = await adapter.getCallStatus(call_id);
    expect(callStatus.call_id).toBe(call_id);
    expect(callStatus.status).toBe("completed");
  });
});

describe("WhatsAppStubAdapter", () => {
  it("sendTemplate returns sent status", async () => {
    const adapter = new WhatsAppStubAdapter();
    const result = await adapter.sendTemplate({
      to: "+5730012345670",
      template_id: "payment_reminder",
      variables: { name: "Ana" },
      tenant_id: "tenant-1"
    });

    expect(result.status).toBe("sent");
    expect(result.message_id).toBeTruthy();
  });

  it("isOptedIn respects registerOptIn", async () => {
    const adapter = new WhatsAppStubAdapter();
    const phone = "+573009999999";
    expect(await adapter.isOptedIn(phone, "tenant-1")).toBe(false);
    adapter.registerOptIn(phone);
    expect(await adapter.isOptedIn(phone, "tenant-1")).toBe(true);
  });
});
