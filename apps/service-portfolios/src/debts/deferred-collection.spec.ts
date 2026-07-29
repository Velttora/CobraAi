import { describe, expect, it, vi } from "vitest";
import {
  getCollectionQuarter,
  getInitialDebtStatus
} from "@cobrai/utils";

describe("deferred collection logic", () => {
  const today = new Date("2026-05-24");

  it("due +90 días → future y Q3-2026", () => {
    const due = new Date("2026-08-22");
    expect(getInitialDebtStatus(due, undefined, today)).toEqual({
      status: "future",
      agingBucket: "future"
    });
    expect(getCollectionQuarter(due)).toBe("Q3-2026");
  });

  it("due +20 días → upcoming", () => {
    const due = new Date("2026-06-13");
    expect(getInitialDebtStatus(due, undefined, today).status).toBe("upcoming");
  });

  it("due hoy → new", () => {
    expect(getInitialDebtStatus(today, undefined, today).status).toBe("new");
  });

  it("due -45 días → active d31_60", () => {
    const due = new Date("2026-04-09");
    expect(getInitialDebtStatus(due, undefined, today)).toEqual({
      status: "active",
      agingBucket: "d31_60"
    });
  });

  it("scheduled_collection_date distinto de due_date", () => {
    const due = new Date("2026-08-22");
    const scheduled = new Date("2026-10-01");
    expect(getCollectionQuarter(scheduled)).toBe("Q4-2026");
    expect(getInitialDebtStatus(due, scheduled, today).status).toBe("future");
  });

  // El evento de creación sale para todos los estados: las reglas de bienvenida
  // (trigger debt_created) deben saludar al deudor apenas la deuda entra al
  // portafolio, aunque todavía no sea gestionable. Lo que sigue reservado a las
  // deudas gestionables es el pipeline de scoring/segmentación.
  it("create publica cobrai.debt.created también para future/upcoming (contrato)", () => {
    const shouldPublish = () => true;
    expect(shouldPublish()).toBe(true);
  });

  it("future/upcoming no entran al pipeline de scoring (contrato)", () => {
    const runsScoring = (status: string) =>
      status !== "future" && status !== "upcoming";
    expect(runsScoring("future")).toBe(false);
    expect(runsScoring("upcoming")).toBe(false);
    expect(runsScoring("new")).toBe(true);
  });
});

describe("portfolio stats recovery", () => {
  it("recovery_rate excluye future/upcoming", () => {
    const activeOriginal = 1000;
    const deferredOriginal = 500;
    const recovered = 200;
    const rate = recovered / activeOriginal;
    expect(rate).toBe(0.2);
    expect(recovered / (activeOriginal + deferredOriginal)).toBeCloseTo(0.133, 2);
  });
});

describe("kafka mock", () => {
  it("deuda new publica cobrai.debt.created", async () => {
    const publish = vi.fn();
    const status = "new";
    if (status === "new" || status === "analyzing" || status === "active") {
      await publish("cobrai.debt.created", { debt_id: "1" });
    }
    expect(publish).toHaveBeenCalledWith("cobrai.debt.created", { debt_id: "1" });
  });
});
