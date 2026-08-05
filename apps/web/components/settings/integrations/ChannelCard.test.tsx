import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChannelCard } from "./ChannelCard";
import { view } from "./test-fixtures";

const useAuthMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({ useAuth: () => useAuthMock() }));

const getFocusMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => getFocusMock(key) })
}));

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

function nonAdmin(): void {
  useAuthMock.mockReturnValue({ orgRole: "org:viewer" });
}

beforeEach(() => {
  getFocusMock.mockReturnValue(null);
  saveMock.mutateAsync = vi.fn();
  saveMock.isPending = false;
  verifyMock.mutateAsync = vi.fn();
  verifyMock.isPending = false;
  disconnectMock.mutateAsync = vi.fn();
  disconnectMock.isPending = false;
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("ChannelCard — non-admin", () => {
  it("muestra un <dl> de solo lectura y el aviso de admin, nunca un formulario", () => {
    nonAdmin();
    const { container } = render(<ChannelCard channel="whatsapp" integration={view({ mode: "managed" })} />);

    expect(screen.getByText("Solo un administrador puede cambiar esta configuración.")).toBeInTheDocument();
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByText("Modo de conexión")).not.toBeInTheDocument();
  });
});

describe("ChannelCard — ChannelModeToggle default", () => {
  it("un canal sin integración parte en modo managed", () => {
    admin();
    render(<ChannelCard channel="whatsapp" integration={undefined} />);
    const managedPill = screen.getByRole("button", { name: "Gestionado por CobraAI" });
    expect(managedPill.className).toContain("bg-[#D85A30]");
  });

  it("no tiene badge 'recomendado' ni ícono de advertencia en BYO", () => {
    admin();
    render(<ChannelCard channel="whatsapp" integration={undefined} />);
    expect(screen.queryByText(/recomendado/i)).not.toBeInTheDocument();
  });
});

describe("ChannelCard — WhatsApp BYO form", () => {
  it("renderiza Account SID, Auth Token y Número de WhatsApp, y guarda vía useSaveIntegration", async () => {
    admin();
    saveMock.mutateAsync.mockResolvedValue({
      data: view({ status: "verified", verifiedAt: "2026-08-04T10:00:00Z" })
    });

    render(<ChannelCard channel="whatsapp" integration={view({ mode: "byo" })} />);

    fireEvent.change(screen.getByLabelText("Account SID de Twilio"), { target: { value: "AC123" } });
    fireEvent.change(screen.getByLabelText("Auth Token"), { target: { value: "secret-token" } });
    fireEvent.change(screen.getByLabelText("Número de WhatsApp"), { target: { value: "+573001234567" } });

    const submit = screen.getByRole("button", { name: "Guardar y verificar" });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await screen.findByText("Guardar y verificar");
    expect(saveMock.mutateAsync).toHaveBeenCalledWith({
      provider: "twilio_whatsapp",
      input: {
        mode: "byo",
        publicConfig: { accountSid: "AC123", phoneNumberE164: "+573001234567" },
        secrets: { authToken: "secret-token" }
      }
    });
  });

  it("el botón de guardar está deshabilitado hasta que el formulario esté sucio y sea válido", () => {
    admin();
    render(<ChannelCard channel="whatsapp" integration={view({ mode: "byo" })} />);

    const submit = screen.getByRole("button", { name: "Guardar y verificar" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Account SID de Twilio"), { target: { value: "AC123" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Auth Token"), { target: { value: "secret-token" } });
    fireEvent.change(screen.getByLabelText("Número de WhatsApp"), { target: { value: "+573001234567" } });
    expect(submit).not.toBeDisabled();
  });
});
