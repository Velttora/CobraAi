import { describe, expect, it } from "vitest";
import {
  buildInstallmentSchedule,
  canBreakPromiseForDebtStatus,
  resolvePromiseStatusForPayment
} from "./promises";

describe("resolvePromiseStatusForPayment", () => {
  it("deuda saldada por completo → kept (aunque el pago sea menor al prometido)", () => {
    expect(
      resolvePromiseStatusForPayment({
        promiseAmount: 1_000_000,
        amountPaid: 100_000,
        debtPaidFull: true
      })
    ).toBe("kept");
  });

  it("pago parcial que cubre el monto prometido → kept", () => {
    expect(
      resolvePromiseStatusForPayment({
        promiseAmount: 500_000,
        amountPaid: 500_000,
        debtPaidFull: false
      })
    ).toBe("kept");
  });

  it("pago parcial menor al prometido → partial (no se rompe)", () => {
    expect(
      resolvePromiseStatusForPayment({
        promiseAmount: 1_000_000,
        amountPaid: 300_000,
        debtPaidFull: false
      })
    ).toBe("partial");
  });
});

describe("canBreakPromiseForDebtStatus", () => {
  it("no rompe promesas de deudas pagadas o castigadas", () => {
    expect(canBreakPromiseForDebtStatus("paid_full")).toBe(false);
    expect(canBreakPromiseForDebtStatus("written_off")).toBe(false);
  });

  it("sí permite romper promesas de deudas aún en gestión", () => {
    expect(canBreakPromiseForDebtStatus("active")).toBe(true);
    expect(canBreakPromiseForDebtStatus("promised")).toBe(true);
    expect(canBreakPromiseForDebtStatus("paid_partial")).toBe(true);
  });
});

describe("buildInstallmentSchedule", () => {
  it("4 cuotas iguales que suman el total (caso SCN-05: 37M)", () => {
    const plan = buildInstallmentSchedule({
      totalAmount: 37_000_000,
      installmentsCount: 4,
      firstDueDate: "2026-08-30",
      intervalDays: 30
    });
    expect(plan).toHaveLength(4);
    expect(plan.map((c) => c.amount)).toEqual([
      9_250_000, 9_250_000, 9_250_000, 9_250_000
    ]);
    expect(plan.reduce((s, c) => s + c.amount, 0)).toBe(37_000_000);
    expect(plan[0]!.dueDate).toBe("2026-08-30");
    expect(plan[1]!.dueDate).toBe("2026-09-29");
    expect(plan.map((c) => c.installmentNumber)).toEqual([1, 2, 3, 4]);
  });

  it("el redondeo se acumula en la última cuota (suma exacta)", () => {
    const plan = buildInstallmentSchedule({
      totalAmount: 1000,
      installmentsCount: 3,
      firstDueDate: "2026-01-01"
    });
    expect(plan.map((c) => c.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(plan.reduce((s, c) => s + c.amount, 0)).toBeCloseTo(1000, 2);
  });
});
