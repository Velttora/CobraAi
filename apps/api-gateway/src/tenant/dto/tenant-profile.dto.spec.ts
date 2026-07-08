import { describe, expect, it } from "vitest";
import { sanitizeContactRetryPolicy, toTenantProfile } from "./tenant-profile.dto";

describe("sanitizeContactRetryPolicy", () => {
  it("aplica los defaults cuando no hay input", () => {
    const policy = sanitizeContactRetryPolicy(undefined);
    expect(policy).toEqual({
      windowHours: 24,
      maxAttempts: 3,
      escalation: "switch_channel",
      escalateTo: "legal_risk"
    });
  });

  it("acepta valores válidos dentro de rango", () => {
    const policy = sanitizeContactRetryPolicy({
      windowHours: 48,
      maxAttempts: 5,
      escalation: "same_channel",
      escalateTo: "human"
    });
    expect(policy).toEqual({
      windowHours: 48,
      maxAttempts: 5,
      escalation: "same_channel",
      escalateTo: "human"
    });
  });

  it("acota windowHours y maxAttempts fuera de rango en vez de aceptarlos", () => {
    const policy = sanitizeContactRetryPolicy({ windowHours: 9999, maxAttempts: 0 });
    expect(policy.windowHours).toBeLessThanOrEqual(24 * 14);
    expect(policy.maxAttempts).toBeGreaterThanOrEqual(1);
  });

  it("ignora un escalation inválido y usa el fallback", () => {
    const policy = sanitizeContactRetryPolicy(
      { escalation: "not_a_real_value" },
      { windowHours: 24, maxAttempts: 3, escalation: "same_channel", escalateTo: "legal_risk" }
    );
    expect(policy.escalation).toBe("same_channel");
  });

  it("ignora un escalateTo inválido y usa el fallback", () => {
    const policy = sanitizeContactRetryPolicy(
      { escalateTo: "not_a_real_target" },
      { windowHours: 24, maxAttempts: 3, escalation: "switch_channel", escalateTo: "human" }
    );
    expect(policy.escalateTo).toBe("human");
  });

  it("acepta escalateTo: human", () => {
    const policy = sanitizeContactRetryPolicy({ escalateTo: "human" });
    expect(policy.escalateTo).toBe("human");
  });

  it("hace merge parcial sobre un fallback dado (comportamiento de patch)", () => {
    const policy = sanitizeContactRetryPolicy(
      { maxAttempts: 5 },
      { windowHours: 48, maxAttempts: 3, escalation: "same_channel", escalateTo: "human" }
    );
    expect(policy).toEqual({
      windowHours: 48,
      maxAttempts: 5,
      escalation: "same_channel",
      escalateTo: "human"
    });
  });
});

describe("toTenantProfile", () => {
  it("expone contactRetryPolicy con defaults cuando settings está vacío", () => {
    const profile = toTenantProfile({
      id: "t1",
      name: "Acme",
      slug: "acme",
      plan: "trial",
      settings: {}
    });
    expect(profile.contactRetryPolicy).toEqual({
      windowHours: 24,
      maxAttempts: 3,
      escalation: "switch_channel",
      escalateTo: "legal_risk"
    });
  });

  it("lee la política guardada en settings.contactRetryPolicy", () => {
    const profile = toTenantProfile({
      id: "t1",
      name: "Acme",
      slug: "acme",
      plan: "trial",
      settings: {
        contactRetryPolicy: {
          windowHours: 12,
          maxAttempts: 2,
          escalation: "same_channel",
          escalateTo: "human"
        }
      }
    });
    expect(profile.contactRetryPolicy).toEqual({
      windowHours: 12,
      maxAttempts: 2,
      escalation: "same_channel",
      escalateTo: "human"
    });
  });
});
