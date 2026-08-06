import { describe, expect, it } from "vitest";
import {
  applyPaymentToPromise,
  buildInstallmentSchedule,
  canBreakPromiseForDebtStatus
} from "./promises";

describe("applyPaymentToPromise", () => {
  it("deuda saldada por completo → kept (aunque el pago sea menor al prometido)", () => {
    expect(
      applyPaymentToPromise({
        promiseAmount: 1_000_000,
        alreadyPaid: 0,
        amountPaid: 100_000,
        debtPaidFull: true
      })
    ).toEqual({ status: "kept", amountPaid: 1_000_000 });
  });

  it("pago que cubre el monto prometido → kept", () => {
    expect(
      applyPaymentToPromise({
        promiseAmount: 500_000,
        alreadyPaid: 0,
        amountPaid: 500_000,
        debtPaidFull: false
      })
    ).toEqual({ status: "kept", amountPaid: 500_000 });
  });

  it("pago menor al prometido → partial, con el abono registrado", () => {
    expect(
      applyPaymentToPromise({
        promiseAmount: 1_000_000,
        alreadyPaid: 0,
        amountPaid: 300_000,
        debtPaidFull: false
      })
    ).toEqual({ status: "partial", amountPaid: 300_000 });
  });

  it("dos abonos de la mitad cumplen la promesa", () => {
    // El caso que antes nunca cerraba: cada pago se medía contra el total y
    // perdía, así que al vencer se fichaba como incumplido a quien pagó todo.
    const primero = applyPaymentToPromise({
      promiseAmount: 500_000,
      alreadyPaid: 0,
      amountPaid: 250_000,
      debtPaidFull: false
    });
    expect(primero).toEqual({ status: "partial", amountPaid: 250_000 });

    expect(
      applyPaymentToPromise({
        promiseAmount: 500_000,
        alreadyPaid: primero.amountPaid,
        amountPaid: 250_000,
        debtPaidFull: false
      })
    ).toEqual({ status: "kept", amountPaid: 500_000 });
  });

  it("no acredita más de lo prometido cuando el pago se pasa", () => {
    expect(
      applyPaymentToPromise({
        promiseAmount: 500_000,
        alreadyPaid: 100_000,
        amountPaid: 900_000,
        debtPaidFull: false
      })
    ).toEqual({ status: "kept", amountPaid: 500_000 });
  });

  it("acumula tres abonos que todavía no alcanzan", () => {
    let paid = 0;
    for (const abono of [100_000, 100_000, 100_000]) {
      const result = applyPaymentToPromise({
        promiseAmount: 500_000,
        alreadyPaid: paid,
        amountPaid: abono,
        debtPaidFull: false
      });
      paid = result.amountPaid;
      expect(result.status).toBe("partial");
    }
    expect(paid).toBe(300_000);
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
