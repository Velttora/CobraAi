import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { EmbeddedSignupButton } from "./EmbeddedSignupButton";

let capturedScriptProps: { onLoad?: () => void; onError?: () => void } = {};
vi.mock("next/script", () => ({
  default: (props: { onLoad?: () => void; onError?: () => void }) => {
    capturedScriptProps = props;
    return null;
  }
}));

const embeddedSignupMock = { mutateAsync: vi.fn(), isPending: false };
const verifyMock = { mutateAsync: vi.fn(), isPending: false };
vi.mock("../../../hooks/use-integrations", () => ({
  useEmbeddedSignup: () => embeddedSignupMock,
  useVerifyIntegration: () => verifyMock
}));

vi.mock("../../../hooks/use-tenant", () => ({
  useTenant: () => ({ data: { data: { name: "Mi Empresa" } } })
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function dispatchFinish(data: Record<string, string>): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.facebook.com",
        data: { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data }
      })
    );
  });
}

function renderReady(): void {
  vi.stubEnv("NEXT_PUBLIC_FACEBOOK_APP_ID", "app-123");
  vi.stubEnv("NEXT_PUBLIC_FACEBOOK_CONFIG_ID", "config-456");
  render(<EmbeddedSignupButton integration={undefined} onSwitchToByo={vi.fn()} />);
  window.FB = { init: vi.fn(), login: vi.fn() };
  act(() => capturedScriptProps.onLoad?.());
}

beforeEach(() => {
  capturedScriptProps = {};
  embeddedSignupMock.mutateAsync = vi.fn().mockResolvedValue({ data: { status: "pending_meta" } });
  verifyMock.mutateAsync = vi.fn();
  vi.unstubAllEnvs();
  delete (window as unknown as { FB?: unknown }).FB;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("EmbeddedSignupButton — handoff exitoso", () => {
  it("envía wabaId/phoneNumberId/phoneNumberE164/businessName a useEmbeddedSignup", async () => {
    renderReady();
    dispatchFinish({
      waba_id: "waba-1",
      phone_number_id: "phone-1",
      phone_number: "+573001234567",
      business_name: "Mi Negocio SAS"
    });

    await act(() => Promise.resolve());
    expect(embeddedSignupMock.mutateAsync).toHaveBeenCalledWith({
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      phoneNumberE164: "+573001234567",
      businessName: "Mi Negocio SAS"
    });
  });

  it("cae al nombre del tenant cuando el postMessage no trae business_name", async () => {
    renderReady();
    dispatchFinish({ waba_id: "waba-1", phone_number_id: "phone-1" });

    await act(() => Promise.resolve());
    expect(embeddedSignupMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: "Mi Empresa" })
    );
  });

  it("muestra la lista de progreso de 3 pasos mientras la llamada está en curso", () => {
    let resolveMutation: (value: { data: { status: string } }) => void = () => undefined;
    embeddedSignupMock.mutateAsync = vi.fn(
      () => new Promise((resolve) => (resolveMutation = resolve))
    );

    renderReady();
    dispatchFinish({ waba_id: "waba-1", phone_number_id: "phone-1" });

    expect(screen.getByText("Creando tu cuenta en Twilio")).toBeInTheDocument();
    expect(screen.getByText("Conectando tu número de WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Verificando el envío")).toBeInTheDocument();

    resolveMutation({ data: { status: "pending_meta" } });
  });
});

describe("EmbeddedSignupButton — sin persistencia (D-26, T-08-17c)", () => {
  it("nunca escribe en localStorage ni sessionStorage durante el handoff", async () => {
    const localSetItem = vi.spyOn(Storage.prototype, "setItem");

    renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Conectar con WhatsApp" }));
    dispatchFinish({
      waba_id: "waba-1",
      phone_number_id: "phone-1",
      phone_number: "+573001234567",
      business_name: "Mi Negocio SAS"
    });
    await act(() => Promise.resolve());

    expect(localSetItem).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    localSetItem.mockRestore();
  });
});
