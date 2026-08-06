import { describe, expect, it } from "vitest";
import type { CommitmentSummary } from "../hooks/use-negotiations";
import { buildCommitmentKpis } from "./commitment-kpis";

function makeSummary(
  overrides: Partial<CommitmentSummary> = {}
): CommitmentSummary {
  return {
    total: 44,
    awaiting_approval: 0,
    awaiting_approval_amount: 0,
    pending: 17,
    overdue: 5,
    kept: 10,
    broken: 12,
    cancelled: 0,
    committed_amount: 211_240_000,
    paid_amount: 49_952_457,
    pending_amount: 131_731_000,
    overdue_amount: 18_400_000,
    keep_rate: 37,
    currency: "COP",
    ...overrides
  };
}

describe("buildCommitmentKpis", () => {
  it("expone plata comprometida, en mora, cumplimiento y recaudo", () => {
    const kpis = buildCommitmentKpis(makeSummary());

    expect(kpis.map((k) => k.key)).toEqual([
      "pending",
      "overdue",
      "keep-rate",
      "paid"
    ]);
    expect(kpis[0]?.hint).toBe("17 compromisos al día");
    expect(kpis[2]?.value).toBe("37%");
    expect(kpis[2]?.hint).toBe("10 cumplidos de 27 ya vencidos");
  });

  it("marca alerta solo cuando hay algo vencido", () => {
    const conMora = buildCommitmentKpis(makeSummary());
    const sinMora = buildCommitmentKpis(
      makeSummary({ overdue: 0, overdue_amount: 0 })
    );

    expect(conMora[1]?.alert).toBe(true);
    expect(sinMora[1]?.alert).toBe(false);
  });

  it("califica el cumplimiento contra la meta", () => {
    const bajo = buildCommitmentKpis(makeSummary({ keep_rate: 37 }));
    const enMeta = buildCommitmentKpis(makeSummary({ keep_rate: 72 }));

    expect(bajo[2]?.trend).toEqual({ value: "Bajo meta", positive: false });
    expect(enMeta[2]?.trend).toEqual({ value: "En meta", positive: true });
  });

  it("no inventa un porcentaje cuando nada ha vencido", () => {
    const kpis = buildCommitmentKpis(
      makeSummary({ keep_rate: null, kept: 0, broken: 0, overdue: 0 })
    );

    expect(kpis[2]?.value).toBe("—");
    expect(kpis[2]?.trend).toBeUndefined();
    expect(kpis[2]?.hint).toBe("Ningún compromiso ha vencido todavía");
  });

  it("cada tarjeta abre la bandeja con su filtro", () => {
    const kpis = buildCommitmentKpis(makeSummary());
    expect(kpis.map((k) => k.status)).toEqual([
      "pending",
      "overdue",
      "kept",
      "kept"
    ]);
  });
});
