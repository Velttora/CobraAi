import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTOMATION_GRACE_HOURS,
  computeAutomationStartsAt,
  isAutomationGraceActive,
  resolveAutomationGraceHours
} from "./automation-grace";

describe("automation-grace", () => {
  it("resolveAutomationGraceHours usa default 2h", () => {
    expect(resolveAutomationGraceHours(undefined)).toBe(
      DEFAULT_AUTOMATION_GRACE_HOURS
    );
    expect(resolveAutomationGraceHours("")).toBe(DEFAULT_AUTOMATION_GRACE_HOURS);
    expect(resolveAutomationGraceHours("4")).toBe(4);
    expect(resolveAutomationGraceHours(-1)).toBe(DEFAULT_AUTOMATION_GRACE_HOURS);
  });

  it("computeAutomationStartsAt suma horas", () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const starts = computeAutomationStartsAt(now, 2);
    expect(starts.toISOString()).toBe("2026-07-30T14:00:00.000Z");
  });

  it("isAutomationGraceActive respeta el instante", () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    expect(isAutomationGraceActive(null, now)).toBe(false);
    expect(
      isAutomationGraceActive(new Date("2026-07-30T14:00:00.000Z"), now)
    ).toBe(true);
    expect(
      isAutomationGraceActive(new Date("2026-07-30T11:00:00.000Z"), now)
    ).toBe(false);
  });
});
