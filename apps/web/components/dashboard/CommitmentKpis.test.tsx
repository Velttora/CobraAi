import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  useCommitmentSummary,
  type CommitmentSummary
} from "../../hooks/use-negotiations";
import { CommitmentKpis } from "./CommitmentKpis";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

vi.mock("../../hooks/use-negotiations", () => ({
  useCommitmentSummary: vi.fn()
}));

const mockSummary = vi.mocked(useCommitmentSummary);

function makeSummary(
  overrides: Partial<CommitmentSummary> = {}
): CommitmentSummary {
  return {
    total: 44,
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

function mockQuery(summary: CommitmentSummary | null, isLoading = false): void {
  mockSummary.mockReturnValue({
    data: summary
      ? { success: true, data: summary, meta: { request_id: "r", timestamp: "t" } }
      : undefined,
    isLoading
  } as unknown as ReturnType<typeof useCommitmentSummary>);
}

describe("CommitmentKpis", () => {
  it("muestra los cuatro indicadores del bloque", () => {
    mockQuery(makeSummary());
    render(<CommitmentKpis />);

    expect(screen.getByText("Vigente por cobrar")).toBeInTheDocument();
    expect(screen.getByText("Vencido sin pagar")).toBeInTheDocument();
    expect(screen.getByText("Cumplimiento de acuerdos")).toBeInTheDocument();
    expect(screen.getByText("Recaudado de lo pactado")).toBeInTheDocument();
    expect(screen.getByText("37%")).toBeInTheDocument();
  });

  it("abre la bandeja ya filtrada al tocar una tarjeta", async () => {
    mockQuery(makeSummary());
    render(<CommitmentKpis />);

    await userEvent.click(screen.getByText("Vencido sin pagar"));

    expect(push).toHaveBeenCalledWith("/negotiations?status=overdue");
  });

  it("se oculta cuando no hay ningún compromiso registrado", () => {
    // Cuatro tarjetas en cero no informan nada; solo ocupan el dashboard.
    mockQuery(makeSummary({ total: 0 }));
    const { container } = render(<CommitmentKpis />);

    expect(container).toBeEmptyDOMElement();
  });
});
