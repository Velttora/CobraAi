import { afterEach, describe, expect, it, vi } from "vitest";
import {
  daysSinceLastContact,
  startOfTodayUtc,
  startOfZonedDayUtc
} from "./index";

describe("startOfTodayUtc (hora Colombia)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("medianoche Bogotá equivale a 05:00 UTC del mismo día", () => {
    vi.setSystemTime(new Date("2026-06-11T02:00:00.000Z"));
    expect(startOfTodayUtc().toISOString()).toBe("2026-06-10T05:00:00.000Z");
  });

  it("antes de medianoche Bogotá sigue contando el día anterior", () => {
    vi.setSystemTime(new Date("2026-06-10T04:59:00.000Z"));
    expect(startOfTodayUtc().toISOString()).toBe("2026-06-09T05:00:00.000Z");
  });

  it("justo a medianoche Bogotá inicia el nuevo día", () => {
    vi.setSystemTime(new Date("2026-06-10T05:00:00.000Z"));
    expect(startOfTodayUtc().toISOString()).toBe("2026-06-10T05:00:00.000Z");
  });
});

describe("startOfZonedDayUtc", () => {
  it("normaliza un instante al inicio del día civil en Colombia", () => {
    const noonBogota = new Date("2026-06-10T17:00:00.000Z");
    expect(startOfZonedDayUtc(noonBogota).toISOString()).toBe(
      "2026-06-10T05:00:00.000Z"
    );
  });
});

describe("daysSinceLastContact", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cuenta días civiles en Colombia, no medianoche UTC", () => {
    vi.setSystemTime(new Date("2026-06-11T02:00:00.000Z"));
    const lastContact = new Date("2026-06-10T20:00:00.000Z");
    expect(daysSinceLastContact(lastContact)).toBe(0);
  });

  it("retorna null sin último contacto", () => {
    expect(daysSinceLastContact(null)).toBeNull();
  });
});
