import { describe, expect, it } from "vitest";
import { normalizeAmount, normalizeDate, normalizePhone } from "./import-normalizers";

describe("import normalizers", () => {
  it("normalizes latin decimal amounts", () => {
    expect(normalizeAmount("1.250.000,50")).toBe(1250000.5);
  });

  it("normalizes Colombian phone numbers to E.164 when valid", () => {
    expect(normalizePhone("300 123 4567")).toBe("+573001234567");
  });

  it("normalizes dd/mm/yyyy dates", () => {
    expect(normalizeDate("31/05/2026")?.toISOString()).toBe("2026-05-31T00:00:00.000Z");
  });
});
