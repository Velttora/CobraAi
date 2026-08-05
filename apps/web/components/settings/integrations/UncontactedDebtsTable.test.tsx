import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UncontactedDebtsTable } from "./UncontactedDebtsTable";
import type { UncontactedDebt } from "../../../lib/types";

const useIntegrationHealthMock = vi.fn();
const useUncontactedDebtsMock = vi.fn();
vi.mock("../../../hooks/use-integrations", () => ({
  useIntegrationHealth: () => useIntegrationHealthMock(),
  useUncontactedDebts: (page: number) => useUncontactedDebtsMock(page)
}));

function debt(overrides: Partial<UncontactedDebt> = {}): UncontactedDebt {
  return {
    debtId: "debt-1",
    debtorId: "debtor-1",
    debtorName: "María Rodríguez",
    externalRef: "FAC-00123",
    amountOutstanding: 450000,
    currency: "COP",
    blockedChannel: "email",
    blockedSince: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides
  };
}

function health(operational: number, total: number) {
  return { data: { data: { items: [], summary: { operational, total } } } };
}

describe("UncontactedDebtsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("estado de carga: renderiza TableSkeleton", () => {
    useIntegrationHealthMock.mockReturnValue({ data: undefined });
    useUncontactedDebtsMock.mockReturnValue({ isLoading: true, isError: false, data: undefined });

    const { container } = render(<UncontactedDebtsTable />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("estado de error: muestra el mensaje de carga y el botón Reintentar", () => {
    useIntegrationHealthMock.mockReturnValue({ data: undefined });
    const refetch = vi.fn();
    useUncontactedDebtsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      refetch
    });

    render(<UncontactedDebtsTable />);
    expect(
      screen.getByText("No se pudo cargar el estado de las integraciones.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("vacío con todos los canales verificados: framing positivo", () => {
    useIntegrationHealthMock.mockReturnValue(health(4, 4));
    useUncontactedDebtsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: { items: [], total: 0, page: 1 } }
    });

    render(<UncontactedDebtsTable />);
    expect(screen.getByText("Ninguna deuda detenida.")).toBeInTheDocument();
    expect(screen.getByText("Todos los canales están operativos.")).toBeInTheDocument();
  });

  it("vacío con canales sin configurar: copy distinta y botón Configurar canales", () => {
    useIntegrationHealthMock.mockReturnValue(health(1, 4));
    useUncontactedDebtsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: { items: [], total: 0, page: 1 } }
    });

    render(<UncontactedDebtsTable />);
    expect(screen.queryByText("Ninguna deuda detenida.")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No hay deudas detenidas todavía/)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurar canales" })).toBeInTheDocument();
  });

  it("no vacío: renderiza la tabla, el callout de acento nombrando el canal, y usa channelLabel", () => {
    useIntegrationHealthMock.mockReturnValue(health(1, 4));
    useUncontactedDebtsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: { items: [debt()], total: 1, page: 1 } }
    });

    render(<UncontactedDebtsTable />);
    expect(screen.getByText(/1 deudas detenidas\. Conecta Email para reanudarlas\./)).toBeInTheDocument();
    // Rendered twice (desktop table row + mobile stacked card) — jsdom does
    // not evaluate the sm: responsive Tailwind classes that hide one of them.
    expect(screen.getAllByText("María Rodríguez").length).toBe(2);
    expect(screen.getAllByText("Email").length).toBeGreaterThan(0);
  });

  it("las filas enlazan al deudor y a la deuda", () => {
    useIntegrationHealthMock.mockReturnValue(health(1, 4));
    useUncontactedDebtsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: { items: [debt()], total: 1, page: 1 } }
    });

    render(<UncontactedDebtsTable />);
    const debtorLinks = screen.getAllByRole("link", { name: "María Rodríguez" });
    expect(debtorLinks[0]).toHaveAttribute("href", "/debtors/debtor-1");

    const debtLinks = screen.getAllByRole("link", { name: /FAC-00123/ });
    expect(debtLinks[0]).toHaveAttribute("href", "/debts/debt-1");
  });

  it("la paginación solo aparece cuando hay más de una página (25 por página)", () => {
    useIntegrationHealthMock.mockReturnValue(health(1, 4));
    useUncontactedDebtsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: { items: [debt()], total: 1, page: 1 } }
    });

    const { rerender } = render(<UncontactedDebtsTable />);
    expect(screen.queryByText(/Página \d+ de \d+/)).not.toBeInTheDocument();

    useUncontactedDebtsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: { items: [debt()], total: 30, page: 1 } }
    });
    rerender(<UncontactedDebtsTable />);
    expect(screen.getByText("Página 1 de 2 (30 total)")).toBeInTheDocument();
  });
});
