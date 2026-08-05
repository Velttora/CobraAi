import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentGatewayPanel } from "./PaymentGatewayPanel";
import type { IntegrationView } from "../../../lib/types";

const useAuthMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => useAuthMock()
}));

const useSearchParamsMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock()
}));

const useIntegrationsMock = vi.fn();
const useSaveIntegrationMock = vi.fn();
const useVerifyIntegrationMock = vi.fn();
const mutateAsyncSave = vi.fn();
const mutateAsyncVerify = vi.fn();
vi.mock("../../../hooks/use-integrations", () => ({
  useIntegrations: () => useIntegrationsMock(),
  useSaveIntegration: () => useSaveIntegrationMock(),
  useVerifyIntegration: () => useVerifyIntegrationMock()
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args)
  }
}));

const PAYMENT_PROVIDERS = ["wompi", "payu", "epayco", "mercadopago", "stripe", "external_link", "transfer"];

function baseItems(overrides: Partial<Record<string, Partial<IntegrationView>>> = {}): IntegrationView[] {
  return PAYMENT_PROVIDERS.map((provider) => ({
    provider,
    channel: "payments",
    mode: "byo",
    status: "not_configured",
    verifiedAt: null,
    failureMessage: null,
    publicConfig: {},
    secrets: [],
    webhookUrl: null,
    ...(overrides[provider] ?? {})
  })) as IntegrationView[];
}

function mockIntegrations(overrides: Partial<Record<string, Partial<IntegrationView>>> = {}): void {
  useIntegrationsMock.mockReturnValue({
    data: { data: { items: baseItems(overrides) } },
    isLoading: false,
    isError: false
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ orgRole: "org:admin" });
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  useSaveIntegrationMock.mockReturnValue({ mutateAsync: mutateAsyncSave, isPending: false });
  useVerifyIntegrationMock.mockReturnValue({ mutateAsync: mutateAsyncVerify, isPending: false });
  mockIntegrations();
});

describe("PaymentGatewayPanel — selector de proveedor", () => {
  it("renderiza las siete opciones agrupadas en 3 optgroups, en el orden correcto", () => {
    render(<PaymentGatewayPanel />);
    const select = screen.getByLabelText("Pasarela de cobro") as HTMLSelectElement;
    const optgroups = select.querySelectorAll("optgroup");
    expect(optgroups).toHaveLength(3);
    expect(optgroups[0]).toHaveAttribute("label", "Pasarelas en Colombia");
    expect(optgroups[1]).toHaveAttribute("label", "Internacional");
    expect(optgroups[2]).toHaveAttribute("label", "Sin integración");

    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual([
      "Wompi (Bancolombia)",
      "PayU Colombia",
      "ePayco",
      "Mercado Pago Colombia",
      "Stripe",
      "Enlace externo (Bold, Nequi, link propio)",
      "Transferencia bancaria"
    ]);
  });
});

describe("PaymentGatewayPanel — BYO-only (D-06)", () => {
  it("no renderiza ningún toggle managed/BYO; muestra la nota BYO-only", () => {
    render(<PaymentGatewayPanel />);
    expect(
      screen.getByText("El cobro siempre va a tu propia cuenta. CobraAI nunca recibe el dinero de tus deudores.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Gestionado por CobraAI/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Traer mis credenciales/i)).not.toBeInTheDocument();
  });
});

describe("PaymentGatewayPanel — campos por proveedor", () => {
  it("wompi (proveedor por defecto) renderiza sus 3 campos con las etiquetas del UI-SPEC", () => {
    render(<PaymentGatewayPanel />);
    expect(screen.getByLabelText(/Llave pública/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Llave privada/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Secreto de eventos/)).toBeInTheDocument();
  });

  it("cambiar a transferencia renderiza sus 5 campos de texto plano", () => {
    render(<PaymentGatewayPanel />);
    fireEvent.change(screen.getByLabelText("Pasarela de cobro"), { target: { value: "transfer" } });
    expect(screen.getByLabelText(/Banco/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tipo de cuenta/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Número de cuenta/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Titular/)).toBeInTheDocument();
    expect(screen.getByLabelText(/NIT/)).toBeInTheDocument();
  });
});

describe("PaymentGatewayPanel — avisos por proveedor", () => {
  it("seleccionar Stripe muestra el aviso ámbar", () => {
    render(<PaymentGatewayPanel />);
    fireEvent.change(screen.getByLabelText("Pasarela de cobro"), { target: { value: "stripe" } });
    expect(
      screen.getByText("Stripe no procesa PSE ni billeteras colombianas, y requiere una entidad en Estados Unidos.")
    ).toBeInTheDocument();
  });

  it("seleccionar enlace externo o transferencia muestra el aviso de confirmación manual (D-14)", () => {
    render(<PaymentGatewayPanel />);
    fireEvent.change(screen.getByLabelText("Pasarela de cobro"), { target: { value: "transfer" } });
    expect(screen.getByText(/Sin confirmación automática/)).toBeInTheDocument();
  });
});

describe("PaymentGatewayPanel — cambio de proveedor gated por ConfirmDialog", () => {
  it("cambiar de proveedor cuando ya hay uno configurado abre el diálogo y solo cambia al confirmar", () => {
    mockIntegrations({
      wompi: {
        status: "verified",
        verifiedAt: "2026-08-01T10:00:00Z",
        publicConfig: { publicKey: "pub_123" },
        secrets: [
          { field: "privateKey", lastFour: "9999", savedAt: "2026-08-01T10:00:00Z" },
          { field: "eventsSecret", lastFour: "1111", savedAt: "2026-08-01T10:00:00Z" }
        ]
      }
    });

    render(<PaymentGatewayPanel />);
    expect(screen.getByLabelText("Pasarela de cobro")).toHaveValue("wompi");

    fireEvent.change(screen.getByLabelText("Pasarela de cobro"), { target: { value: "stripe" } });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("¿Cambiar a Stripe?")).toBeInTheDocument();
    // Not yet switched.
    expect(screen.getByLabelText(/Llave pública/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar de proveedor" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pasarela de cobro")).toHaveValue("stripe");
  });
});

describe("PaymentGatewayPanel — interacción de guardado (D-11)", () => {
  it("mientras guarda, el botón dice Verificando… y el selector está disabled", () => {
    useSaveIntegrationMock.mockReturnValue({ mutateAsync: mutateAsyncSave, isPending: true });
    render(<PaymentGatewayPanel />);
    expect(screen.getByRole("button", { name: "Verificando…" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pasarela de cobro")).toBeDisabled();
  });

  it("al verificar con éxito muestra el toast de éxito", async () => {
    mutateAsyncSave.mockResolvedValue({ success: true, data: baseItems({ wompi: { status: "verified" } })[0], meta: {} });
    render(<PaymentGatewayPanel />);

    fireEvent.change(screen.getByLabelText(/Llave pública/), { target: { value: "pub_123" } });
    fireEvent.change(screen.getByLabelText(/Llave privada/), { target: { value: "priv_123" } });
    fireEvent.change(screen.getByLabelText(/Secreto de eventos/), { target: { value: "evt_123" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Credenciales verificadas"));
  });

  it("cuando el proveedor rechaza, renderiza el bloque de fallo obligatorio con el mensaje y el remedio", () => {
    mockIntegrations({ wompi: { status: "failed", failureMessage: "INVALID_ACCESS_TOKEN" } });
    render(<PaymentGatewayPanel />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("INVALID_ACCESS_TOKEN");
    expect(alert).toHaveTextContent("Wompi rechazó las llaves");
    expect(screen.getByRole("button", { name: "Reintentar verificación" })).toBeInTheDocument();
  });
});

describe("PaymentGatewayPanel — etiqueta Configurado vs Verificado", () => {
  it("external_link muestra Configurado; un gateway verificado muestra Verificado", () => {
    mockIntegrations({
      external_link: {
        status: "verified",
        verifiedAt: "2026-08-01T10:00:00Z",
        publicConfig: { template: "https://x.co?ref={ref}" }
      }
    });
    const { rerender } = render(<PaymentGatewayPanel />);
    expect(screen.getByText("Configurado")).toBeInTheDocument();
    expect(screen.queryByText("Verificado")).not.toBeInTheDocument();

    mockIntegrations({ wompi: { status: "verified", verifiedAt: "2026-08-01T10:00:00Z" } });
    rerender(<PaymentGatewayPanel />);
    expect(screen.getByText("Verificado")).toBeInTheDocument();
  });
});

describe("PaymentGatewayPanel — URL del webhook", () => {
  it("aparece para wompi y no para external_link", () => {
    mockIntegrations({
      wompi: {
        status: "verified",
        verifiedAt: "2026-08-01T10:00:00Z",
        webhookUrl: "https://api.cobrai.dev/webhooks/payments/abc"
      }
    });
    const { rerender } = render(<PaymentGatewayPanel />);
    expect(screen.getByText(/Pega esta URL en la consola de Wompi/)).toBeInTheDocument();

    mockIntegrations({
      external_link: { status: "verified", verifiedAt: "2026-08-01T10:00:00Z" }
    });
    rerender(<PaymentGatewayPanel />);
    expect(screen.queryByText(/Pega esta URL en la consola/)).not.toBeInTheDocument();
  });
});

describe("PaymentGatewayPanel — no-admin", () => {
  it("ve el <dl> de solo lectura con lastFour y el aviso, nunca un formulario", () => {
    useAuthMock.mockReturnValue({ orgRole: "org:viewer" });
    mockIntegrations({
      wompi: {
        status: "verified",
        verifiedAt: "2026-08-01T10:00:00Z",
        secrets: [{ field: "privateKey", lastFour: "4242", savedAt: "2026-08-01T10:00:00Z" }]
      }
    });

    render(<PaymentGatewayPanel />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("•••• 4242")).toBeInTheDocument();
    expect(screen.getByText("Solo un administrador puede cambiar esta configuración.")).toBeInTheDocument();
  });
});

describe("PaymentGatewayPanel — estado vacío", () => {
  it("muestra Todavía no puedes cobrar cuando no hay proveedor configurado", () => {
    render(<PaymentGatewayPanel />);
    expect(screen.getByText("Todavía no puedes cobrar")).toBeInTheDocument();
    expect(screen.getByText(/Elige una pasarela o pega tu enlace de pago/)).toBeInTheDocument();
  });
});
