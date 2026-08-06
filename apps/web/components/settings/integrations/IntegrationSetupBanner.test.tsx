import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntegrationSetupBanner } from "./IntegrationSetupBanner";
import type { IntegrationView } from "../../../lib/types";

const useIntegrationsMock = vi.fn();
const useUncontactedDebtsMock = vi.fn();
vi.mock("../../../hooks/use-integrations", () => ({
  useIntegrations: () => useIntegrationsMock(),
  useUncontactedDebts: (page: number) => useUncontactedDebtsMock(page)
}));

function view(overrides: Partial<IntegrationView>): IntegrationView {
  return {
    provider: "twilio_whatsapp",
    channel: "whatsapp",
    mode: "byo",
    status: "not_configured",
    verifiedAt: null,
    failureMessage: null,
    publicConfig: {},
    secrets: [],
    webhookUrl: null,
    ...overrides
  };
}

describe("IntegrationSetupBanner", () => {
  it("renderiza con role=alert cuando ningún canal está verificado", () => {
    useIntegrationsMock.mockReturnValue({
      data: { data: { items: [view({ status: "not_configured" })] } },
      isLoading: false
    });
    useUncontactedDebtsMock.mockReturnValue({ data: { data: { total: 0, page: 1 } } });

    render(<IntegrationSetupBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("No estamos contactando a tus deudores")).toBeInTheDocument();
  });

  it("NO renderiza cuando al menos un canal está verificado (degradación parcial)", () => {
    useIntegrationsMock.mockReturnValue({
      data: {
        data: {
          items: [
            view({ channel: "whatsapp", status: "verified" }),
            view({ channel: "email", status: "not_configured" })
          ]
        }
      },
      isLoading: false
    });
    useUncontactedDebtsMock.mockReturnValue({ data: { data: { total: 0, page: 1 } } });

    const { container } = render(<IntegrationSetupBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("la línea de deudas detenidas solo aparece cuando el conteo es mayor que cero", () => {
    useIntegrationsMock.mockReturnValue({
      data: { data: { items: [view({ status: "not_configured" })] } },
      isLoading: false
    });
    useUncontactedDebtsMock.mockReturnValue({ data: { data: { total: 5, page: 1 } } });

    render(<IntegrationSetupBanner />);
    expect(screen.getByText("5 deudas están detenidas esperando por esto.")).toBeInTheDocument();
  });

  it("no muestra la línea de deudas detenidas cuando el conteo es cero", () => {
    useIntegrationsMock.mockReturnValue({
      data: { data: { items: [view({ status: "not_configured" })] } },
      isLoading: false
    });
    useUncontactedDebtsMock.mockReturnValue({ data: { data: { total: 0, page: 1 } } });

    render(<IntegrationSetupBanner />);
    expect(screen.queryByText(/deudas están detenidas/)).not.toBeInTheDocument();
  });

  it("mientras carga no renderiza (evita el parpadeo de la alerta antes de saber el estado real)", () => {
    useIntegrationsMock.mockReturnValue({ data: undefined, isLoading: true });
    useUncontactedDebtsMock.mockReturnValue({ data: undefined });

    const { container } = render(<IntegrationSetupBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
