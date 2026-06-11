import { afterEach, describe, expect, it, vi } from "vitest";
import { startOfTodayUtc } from "@cobrai/utils";

describe("startOfTodayUtc (hora Colombia)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("medianoche Bogotá equivale a 05:00 UTC del mismo día", () => {
    // 9:00 PM Bogotá del 10/06 = 02:00 UTC del 11/06
    vi.setSystemTime(new Date("2026-06-11T02:00:00.000Z"));
    expect(startOfTodayUtc().toISOString()).toBe("2026-06-10T05:00:00.000Z");
  });

  it("antes de medianoche Bogotá sigue contando el día anterior", () => {
    // 11:59 PM Bogotá del 09/06 = 04:59 UTC del 10/06
    vi.setSystemTime(new Date("2026-06-10T04:59:00.000Z"));
    expect(startOfTodayUtc().toISOString()).toBe("2026-06-09T05:00:00.000Z");
  });

  it("justo a medianoche Bogotá inicia el nuevo día", () => {
    // 00:00 Bogotá del 10/06 = 05:00 UTC del 10/06
    vi.setSystemTime(new Date("2026-06-10T05:00:00.000Z"));
    expect(startOfTodayUtc().toISOString()).toBe("2026-06-10T05:00:00.000Z");
  });
});
