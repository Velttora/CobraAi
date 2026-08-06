import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntegrationsTabs } from "./IntegrationsTabs";
import type { IntegrationView } from "../../../lib/types";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock()
}));

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

function mockData(items: IntegrationView[], total = 0) {
  useIntegrationsMock.mockReturnValue({ data: { data: { items } } });
  useUncontactedDebtsMock.mockReturnValue({ data: { data: { total, page: 1 } } });
}

describe("IntegrationsTabs", () => {
  it("renderiza un <nav aria-label> con 4 <Link> y aria-current en la ruta activa", () => {
    usePathnameMock.mockReturnValue("/settings/integrations");
    mockData([]);

    render(<IntegrationsTabs />);

    const nav = screen.getByRole("navigation", { name: "Secciones de integraciones" });
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(4);

    const active = screen.getByRole("link", { name: /^Canales/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("no usa role=tab en los enlaces (son tabs basados en navegación, no fake tabs)", () => {
    usePathnameMock.mockReturnValue("/settings/integrations");
    mockData([]);
    const { container } = render(<IntegrationsTabs />);
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
  });

  it("muestra un punto rojo en Canales cuando algún canal está failed", () => {
    usePathnameMock.mockReturnValue("/settings/integrations/payments");
    mockData([view({ channel: "whatsapp", status: "failed" })]);

    const { container } = render(<IntegrationsTabs />);
    const channelsLink = screen.getByRole("link", { name: /^Canales/ });
    expect(channelsLink.querySelector(".bg-red-500")).toBeInTheDocument();
    void container;
  });

  it("muestra un punto ámbar en Canales cuando algún canal está pending_dns (sin failed)", () => {
    usePathnameMock.mockReturnValue("/settings/integrations");
    mockData([view({ channel: "email", status: "pending_dns" })]);

    render(<IntegrationsTabs />);
    const channelsLink = screen.getByRole("link", { name: /^Canales/ });
    expect(channelsLink.querySelector(".bg-amber-500")).toBeInTheDocument();
  });

  it("muestra un pill con el número de deudas bloqueadas en Estado, y ningún pill si es cero", () => {
    usePathnameMock.mockReturnValue("/settings/integrations");
    mockData([], 7);

    render(<IntegrationsTabs />);
    expect(screen.getByLabelText("7 deudas bloqueadas")).toBeInTheDocument();
  });

  it("no muestra pill en Estado cuando el conteo bloqueado es cero", () => {
    usePathnameMock.mockReturnValue("/settings/integrations");
    mockData([], 0);

    render(<IntegrationsTabs />);
    expect(screen.queryByText(/deudas bloqueadas/)).not.toBeInTheDocument();
  });
});
