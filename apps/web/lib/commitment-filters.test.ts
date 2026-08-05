import { describe, expect, it } from "vitest";
import type { CommitmentItem } from "../hooks/use-negotiations";
import {
  emptyMessage,
  formatCommitmentTitle,
  formatDueLabel,
  formatProgressLabel,
  isDueSoon,
  matchesCommitmentType,
  parseStatusParam,
  progressPct,
  sortCommitments
} from "./commitment-filters";

function makeItem(overrides: Partial<CommitmentItem> = {}): CommitmentItem {
  return {
    id: "promise:1",
    source: "direct_promise",
    status: "agreed",
    commitment_state: "pending",
    debt_id: "debt1",
    debtor_id: "debtor1",
    debtor_name: "Juan Pérez",
    debt_external_ref: "FAC-001",
    debt_amount_outstanding: 1_200_000,
    debt_due_date: "2026-01-15T00:00:00.000Z",
    aging_bucket: "d31_60",
    currency: "COP",
    ai_segment: "high",
    portfolio_id: "port1",
    portfolio_name: "Cartera Enero",
    offer_settlement_amount: 450_000,
    offer_installments: 1,
    amount_paid: 0,
    installments_paid: 0,
    due_date: "2026-03-20T00:00:00.000Z",
    days_overdue: -10,
    channel: "whatsapp",
    notes: null,
    conversation: null,
    conversation_id: null,
    agreed_at: "2026-03-05T00:00:00.000Z",
    updated_at: "2026-03-05T00:00:00.000Z",
    plan_id: null,
    has_detail: false,
    ...overrides
  };
}

describe("formatCommitmentTitle", () => {
  it("nombra la promesa por su monto", () => {
    expect(formatCommitmentTitle(makeItem())).toBe("Promesa · COP 450.000");
  });

  it("nombra el plan por sus cuotas y su total", () => {
    const title = formatCommitmentTitle(
      makeItem({
        source: "direct_plan",
        offer_installments: 3,
        offer_settlement_amount: 900_000
      })
    );
    expect(title).toBe("Plan · 3 cuotas · COP 900.000");
  });
});

describe("formatDueLabel", () => {
  it("dice cuántos días lleva vencido", () => {
    const label = formatDueLabel(
      makeItem({ commitment_state: "overdue", days_overdue: 9 })
    );
    expect(label).toBe("Venció hace 9 días");
  });

  it("distingue el vencimiento de hoy del futuro", () => {
    expect(formatDueLabel(makeItem({ days_overdue: 0 }))).toBe("Vence hoy");
    expect(formatDueLabel(makeItem({ days_overdue: -1 }))).toBe("Vence en 1 día");
  });

  it("no habla de vencimiento cuando ya se pagó", () => {
    expect(
      formatDueLabel(makeItem({ commitment_state: "kept", days_overdue: 5 }))
    ).toBe("Pagada");
  });

  it("marca el compromiso sin fecha en vez de inventar una", () => {
    expect(formatDueLabel(makeItem({ due_date: null }))).toBe(
      "Sin fecha pactada"
    );
  });
});

describe("isDueSoon", () => {
  it("avisa solo dentro de la ventana en que aún se puede recordar", () => {
    expect(isDueSoon(makeItem({ days_overdue: -2 }))).toBe(true);
    expect(isDueSoon(makeItem({ days_overdue: -10 }))).toBe(false);
    // Ya vencido no es "por vencer": lo pinta el estado, no esta señal.
    expect(
      isDueSoon(makeItem({ commitment_state: "overdue", days_overdue: 3 }))
    ).toBe(false);
  });
});

describe("avance del plan", () => {
  it("resume cuotas pagadas y porcentaje abonado", () => {
    const plan = makeItem({
      source: "direct_plan",
      offer_installments: 3,
      installments_paid: 1,
      offer_settlement_amount: 900_000,
      amount_paid: 300_000
    });

    expect(formatProgressLabel(plan)).toBe("1 de 3 cuotas pagadas");
    expect(progressPct(plan)).toBe(33);
  });

  it("no muestra avance en una promesa de pago único", () => {
    expect(formatProgressLabel(makeItem())).toBeNull();
  });
});

describe("matchesCommitmentType", () => {
  it("filtra por cómo se pactó", () => {
    const promise = makeItem();
    const plan = makeItem({ source: "direct_plan" });

    expect(matchesCommitmentType(promise, "all")).toBe(true);
    expect(matchesCommitmentType(promise, "direct_promise")).toBe(true);
    expect(matchesCommitmentType(promise, "direct_plan")).toBe(false);
    expect(matchesCommitmentType(plan, "direct_plan")).toBe(true);
  });
});

describe("sortCommitments", () => {
  const a = makeItem({ id: "a", offer_settlement_amount: 100, agreed_at: "2026-01-01T00:00:00.000Z" });
  const b = makeItem({ id: "b", offer_settlement_amount: 900, agreed_at: "2026-02-01T00:00:00.000Z" });

  it("respeta el orden de urgencia que ya trae el backend", () => {
    expect(sortCommitments([a, b], "urgency").map((i) => i.id)).toEqual([
      "a",
      "b"
    ]);
  });

  it("ordena por monto y por recencia sin mutar la lista original", () => {
    const input = [a, b];
    expect(sortCommitments(input, "amount").map((i) => i.id)).toEqual(["b", "a"]);
    expect(sortCommitments(input, "recent").map((i) => i.id)).toEqual(["b", "a"]);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("parseStatusParam", () => {
  it("acepta los filtros con los que enlaza el dashboard", () => {
    expect(parseStatusParam("overdue")).toBe("overdue");
    expect(parseStatusParam("kept")).toBe("kept");
  });

  it("cae en 'Todas' ante un valor ausente o desconocido", () => {
    // Un filtro inventado dejaría la bandeja vacía sin explicar por qué.
    expect(parseStatusParam(null)).toBe("all");
    expect(parseStatusParam("escalated")).toBe("all");
  });
});

describe("emptyMessage", () => {
  it("explica el vacío según el filtro activo", () => {
    expect(emptyMessage("overdue", "all", false)).toContain("Todo lo pactado va al día");
    expect(emptyMessage("kept", "direct_plan", false)).toContain("planes en cuotas");
    expect(emptyMessage("all", "all", true)).toContain("búsqueda");
  });
});
