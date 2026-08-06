import { describe, expect, it } from "vitest";
import {
  daysOverdue,
  derivePlanState,
  derivePromiseState,
  sourceForFilter,
  statesForFilter,
  summarizePlanProgress,
  toEngineStatus
} from "./commitment-status";

const NOW = new Date("2026-03-10T14:30:00.000Z");
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe("derivePromiseState", () => {
  it("marca vencida una promesa pendiente cuya fecha ya pasó", () => {
    expect(derivePromiseState("pending", d("2026-03-01"), NOW)).toBe("overdue");
  });

  it("mantiene vigente la promesa que vence hoy", () => {
    // Vence hoy: el deudor todavía tiene el día para pagar.
    expect(derivePromiseState("pending", d("2026-03-10"), NOW)).toBe("pending");
  });

  it("mantiene vigente la promesa futura", () => {
    expect(derivePromiseState("pending", d("2026-03-20"), NOW)).toBe("pending");
  });

  it("trata el abono parcial como compromiso vivo, no cumplido", () => {
    expect(derivePromiseState("partial", d("2026-03-20"), NOW)).toBe("pending");
    expect(derivePromiseState("partial", d("2026-03-01"), NOW)).toBe("overdue");
  });

  it("respeta los estados ya resueltos por encima del calendario", () => {
    expect(derivePromiseState("kept", d("2026-03-01"), NOW)).toBe("kept");
    expect(derivePromiseState("broken", d("2026-03-20"), NOW)).toBe("broken");
  });
});

describe("derivePlanState", () => {
  const installment = (status: string, date: string) => ({
    status,
    promisedDate: d(date),
    amount: 100,
    amountPaid: status === "kept" ? 100 : 0
  });

  it("marca en mora un plan activo con una cuota vencida sin pagar", () => {
    const state = derivePlanState(
      "active",
      [installment("kept", "2026-02-01"), installment("pending", "2026-03-01")],
      NOW
    );
    expect(state).toBe("overdue");
  });

  it("mantiene vigente el plan cuyas cuotas vencidas están pagadas", () => {
    const state = derivePlanState(
      "active",
      [installment("kept", "2026-02-01"), installment("pending", "2026-04-01")],
      NOW
    );
    expect(state).toBe("pending");
  });

  it("traduce los estados terminales del plan", () => {
    expect(derivePlanState("completed", [], NOW)).toBe("kept");
    expect(derivePlanState("defaulted", [], NOW)).toBe("broken");
    expect(derivePlanState("cancelled", [], NOW)).toBe("cancelled");
  });
});

describe("summarizePlanProgress", () => {
  it("cuenta lo pagado y apunta a la cuota vencida más antigua", () => {
    const progress = summarizePlanProgress(
      [
        { status: "kept", promisedDate: d("2026-01-01"), amount: 500, amountPaid: 500 },
        { status: "pending", promisedDate: d("2026-02-01"), amount: 500, amountPaid: 0 },
        { status: "pending", promisedDate: d("2026-03-01"), amount: 500, amountPaid: 0 },
        { status: "pending", promisedDate: d("2026-04-01"), amount: 500, amountPaid: 0 }
      ],
      NOW
    );

    expect(progress.installmentsPaid).toBe(1);
    expect(progress.amountPaid).toBe(500);
    expect(progress.nextDueDate).toEqual(d("2026-02-01"));
    expect(progress.oldestOverdueDate).toEqual(d("2026-02-01"));
  });

  it("no reporta mora cuando ninguna cuota pendiente ha vencido", () => {
    const progress = summarizePlanProgress(
      [
        { status: "kept", promisedDate: d("2026-02-01"), amount: 300, amountPaid: 300 },
        { status: "pending", promisedDate: d("2026-04-01"), amount: 300, amountPaid: 0 }
      ],
      NOW
    );

    expect(progress.oldestOverdueDate).toBeNull();
    expect(progress.nextDueDate).toEqual(d("2026-04-01"));
  });

  it("cuenta los abonos de una cuota a medias", () => {
    // Sumar solo cuotas cerradas mostraba este abono como cero, y el deudor
    // aparecía sin haber pagado nada de la cuota en curso.
    const progress = summarizePlanProgress(
      [
        { status: "kept", promisedDate: d("2026-02-01"), amount: 300, amountPaid: 300 },
        { status: "partial", promisedDate: d("2026-04-01"), amount: 300, amountPaid: 120 }
      ],
      NOW
    );

    expect(progress.installmentsPaid).toBe(1);
    expect(progress.amountPaid).toBe(420);
  });
});

describe("daysOverdue", () => {
  it("cuenta días completos y devuelve negativo si aún no vence", () => {
    expect(daysOverdue(d("2026-03-01"), NOW)).toBe(9);
    expect(daysOverdue(d("2026-03-10"), NOW)).toBe(0);
    expect(daysOverdue(d("2026-03-15"), NOW)).toBe(-5);
  });
});

describe("statesForFilter", () => {
  it("sin filtro devuelve todos", () => {
    expect(statesForFilter()).toBeNull();
    expect(statesForFilter("all")).toBeNull();
  });

  it("traduce los alias del motor de negociación", () => {
    expect(statesForFilter("agreed")).toEqual(["pending", "overdue", "kept"]);
    expect(statesForFilter("defaulted")).toEqual(["broken"]);
  });

  it("mapea el vocabulario del motor a lo que espera aprobación", () => {
    expect(statesForFilter("escalated")).toEqual(["awaiting_approval"]);
    expect(statesForFilter("open")).toEqual(["awaiting_approval"]);
  });

  it("devuelve vacío para lo que solo existe con motor", () => {
    // Las ofertas con vencimiento son del motor: acá no hay ninguna.
    expect(statesForFilter("expired")).toEqual([]);
  });
});

describe("sourceForFilter y toEngineStatus", () => {
  it("acota la consulta al tipo pedido", () => {
    expect(sourceForFilter("direct_plan")).toEqual(["direct_plan"]);
    expect(sourceForFilter("direct_promise")).toEqual(["direct_promise"]);
    expect(sourceForFilter("all")).toEqual(["direct_promise", "direct_plan"]);
  });

  it("mapea el estado real al vocabulario del motor", () => {
    expect(toEngineStatus("pending")).toBe("agreed");
    expect(toEngineStatus("overdue")).toBe("agreed");
    expect(toEngineStatus("kept")).toBe("agreed");
    expect(toEngineStatus("broken")).toBe("defaulted");
    expect(toEngineStatus("cancelled")).toBe("rejected");
  });
});
