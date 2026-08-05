import { describe, expect, it } from "vitest";
import { resolveDebtStatusAfterPayment } from "./debt-status-after-payment";

describe("resolveDebtStatusAfterPayment", () => {
  it("saldo cero → paid_full aunque hubiera plan", () => {
    expect(
      resolveDebtStatusAfterPayment({
        currentStatus: "plan",
        amountOutstanding: 0,
        hasActivePaymentPlan: true,
        hasPendingStandalonePromise: false
      })
    ).toBe("paid_full");
  });

  it("abono a plan activo → se queda en plan", () => {
    expect(
      resolveDebtStatusAfterPayment({
        currentStatus: "plan",
        amountOutstanding: 500_000,
        hasActivePaymentPlan: true,
        hasPendingStandalonePromise: false
      })
    ).toBe("plan");
  });

  it("abono con promesa suelta pendiente → promised", () => {
    expect(
      resolveDebtStatusAfterPayment({
        currentStatus: "promised",
        amountOutstanding: 200_000,
        hasActivePaymentPlan: false,
        hasPendingStandalonePromise: true
      })
    ).toBe("promised");
  });

  it("abono parcial sin plan ni promesa → paid_partial", () => {
    expect(
      resolveDebtStatusAfterPayment({
        currentStatus: "active",
        amountOutstanding: 100_000,
        hasActivePaymentPlan: false,
        hasPendingStandalonePromise: false
      })
    ).toBe("paid_partial");
  });
});
