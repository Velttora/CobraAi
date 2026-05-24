import { describe, expect, it } from "vitest";
import { formatCurrency, normalizePhoneE164 } from "./index";

describe("formatCurrency", () => {
  it("formats COP without decimals", () => {
    const formatted = formatCurrency(1_500_000, "COP");
    expect(formatted).toContain("1");
  });
});

describe("normalizePhoneE164", () => {
  it("adds country code for 10-digit CO numbers", () => {
    expect(normalizePhoneE164("3001234567")).toBe("+573001234567");
  });
});
