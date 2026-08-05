import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChannelCard } from "./ChannelCard";
import { view } from "./test-fixtures";

const getFocusMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => getFocusMock(key) })
}));

const useAuthMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({ useAuth: () => useAuthMock() }));

const saveMock = { mutateAsync: vi.fn(), isPending: false };
const verifyMock = { mutateAsync: vi.fn(), isPending: false };
const disconnectMock = { mutateAsync: vi.fn(), isPending: false };
vi.mock("../../../hooks/use-integrations", () => ({
  useSaveIntegration: () => saveMock,
  useVerifyIntegration: () => verifyMock,
  useDisconnectIntegration: () => disconnectMock
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) }
}));

function admin(): void {
  useAuthMock.mockReturnValue({ orgRole: "org:admin" });
}

beforeEach(() => {
  getFocusMock.mockReturnValue(null);
  admin();
  saveMock.mutateAsync = vi.fn();
  saveMock.isPending = false;
  verifyMock.mutateAsync = vi.fn();
  verifyMock.isPending = false;
  disconnectMock.mutateAsync = vi.fn();
  disconnectMock.isPending = false;
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("ChannelCard — cambio de modo con integración verificada", () => {
  it("abre el ConfirmDialog y solo cambia de modo al confirmar", () => {
    admin();
    render(<ChannelCard channel="whatsapp" integration={view({ mode: "byo", status: "verified" })} />);

    fireEvent.click(screen.getByRole("button", { name: "Gestionado por CobraAI" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("¿Cambiar el modo de conexión?")).toBeInTheDocument();

    // Still BYO — mode did not change until confirmed.
    expect(screen.getByLabelText("Account SID de Twilio")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar modo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Account SID de Twilio")).not.toBeInTheDocument();
  });
});

describe("ChannelCard — estado de guardado en curso", () => {
  it("botón en Verificando…, inputs deshabilitados y badge en verifying", () => {
    admin();
    saveMock.isPending = true;
    render(<ChannelCard channel="whatsapp" integration={view({ mode: "byo" })} />);

    expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();
    expect(screen.getByLabelText("Account SID de Twilio")).toBeDisabled();
    // The badge (top-right) shows "Verificando…" too — at least the submit
    // button and the badge both render the label while a save is in flight.
    expect(screen.getAllByText("Verificando…").length).toBeGreaterThanOrEqual(2);
  });
});

describe("ChannelCard — resultado del guardado", () => {
  it("rechazo del proveedor (status: failed) marca el badge como fallido y muestra el bloque de error", async () => {
    admin();
    saveMock.mutateAsync.mockResolvedValue({
      data: view({ status: "failed", failureMessage: "Invalid AccessToken" })
    });

    const { rerender } = render(<ChannelCard channel="whatsapp" integration={view({ mode: "byo" })} />);
    fireEvent.change(screen.getByLabelText("Account SID de Twilio"), { target: { value: "AC123" } });
    fireEvent.change(screen.getByLabelText("Auth Token"), { target: { value: "bad-token" } });
    fireEvent.change(screen.getByLabelText("Número de WhatsApp"), { target: { value: "+573001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("No pudimos verificar las credenciales"));

    // Re-render with the refetched (failed) integration to assert the alert block.
    rerender(
      <ChannelCard
        channel="whatsapp"
        integration={view({ mode: "byo", status: "failed", failureMessage: "Invalid AccessToken" })}
      />
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Invalid AccessToken");
  });

  it("una falla de red o 5xx deja el badge sin cambios y no lo marca como fallido", async () => {
    admin();
    saveMock.mutateAsync.mockRejectedValue(new Error("network down"));

    render(<ChannelCard channel="whatsapp" integration={view({ mode: "byo", status: "not_configured" })} />);
    fireEvent.change(screen.getByLabelText("Account SID de Twilio"), { target: { value: "AC123" } });
    fireEvent.change(screen.getByLabelText("Auth Token"), { target: { value: "token" } });
    fireEvent.change(screen.getByLabelText("Número de WhatsApp"), { target: { value: "+573001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    await screen.findByText("Guardar y verificar");
    expect(toastError).toHaveBeenCalledWith("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    expect(screen.getByText("Sin configurar")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ChannelCard — Reintentar verificación", () => {
  it("está conectado a useVerifyIntegration", () => {
    admin();
    verifyMock.mutateAsync.mockResolvedValue({ data: view({ status: "verified" }) });

    render(
      <ChannelCard
        channel="whatsapp"
        integration={view({ mode: "byo", status: "failed", failureMessage: "Invalid AccessToken" })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reintentar verificación" }));
    expect(verifyMock.mutateAsync).toHaveBeenCalledWith("twilio_whatsapp");
  });
});
