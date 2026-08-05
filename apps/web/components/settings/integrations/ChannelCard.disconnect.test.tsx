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

beforeEach(() => {
  getFocusMock.mockReturnValue(null);
  useAuthMock.mockReturnValue({ orgRole: "org:admin" });
  saveMock.mutateAsync = vi.fn();
  saveMock.isPending = false;
  verifyMock.mutateAsync = vi.fn();
  verifyMock.isPending = false;
  disconnectMock.mutateAsync = vi.fn();
  disconnectMock.isPending = false;
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("ChannelCard — Teléfono sin WhatsApp conectado (managed)", () => {
  it("deshabilita el botón, explica por qué y ofrece un enlace a WhatsApp", () => {
    render(
      <ChannelCard
        channel="voice"
        integration={view({ provider: "twilio_voice", channel: "voice", mode: "managed" })}
        relatedIntegration={view({ status: "not_configured" })}
      />
    );

    expect(
      screen.getByText("Las llamadas usan el mismo número que WhatsApp. Conecta WhatsApp primero.")
    ).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Activar llamadas" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title");

    expect(screen.getByRole("link", { name: "Ir a WhatsApp" })).toHaveAttribute(
      "href",
      "/settings/integrations?focus=whatsapp"
    );
  });

  it("con WhatsApp verificado, ofrece Activar llamadas habilitado", () => {
    render(
      <ChannelCard
        channel="voice"
        integration={view({ provider: "twilio_voice", channel: "voice", mode: "managed" })}
        relatedIntegration={view({ status: "verified", publicConfig: { fromNumber: "whatsapp:+573001234567" } })}
      />
    );

    const button = screen.getByRole("button", { name: "Activar llamadas" });
    expect(button).not.toBeDisabled();
    expect(screen.getByText(/Las llamadas salen desde/)).toBeInTheDocument();
  });
});

describe("ChannelCard — Desconectar", () => {
  it("no hace nada hasta que se confirma el diálogo", async () => {
    disconnectMock.mutateAsync.mockResolvedValue({ data: view({ status: "not_configured" }) });

    render(<ChannelCard channel="whatsapp" integration={view({ mode: "byo", status: "verified" })} />);

    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(disconnectMock.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(disconnectMock.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    // The trigger and the dialog's confirm button now share the name
    // "Desconectar" — the dialog's is the second one in DOM order.
    const [, confirmButton] = screen.getAllByRole("button", { name: "Desconectar" });
    fireEvent.click(confirmButton!);

    await waitFor(() => expect(disconnectMock.mutateAsync).toHaveBeenCalledWith("twilio_whatsapp"));
    expect(toastSuccess).toHaveBeenCalledWith("Canal desconectado");
  });
});
