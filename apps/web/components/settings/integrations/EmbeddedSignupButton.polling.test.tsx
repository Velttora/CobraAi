import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { EmbeddedSignupButton } from "./EmbeddedSignupButton";
import { view } from "./test-fixtures";

vi.mock("next/script", () => ({ default: () => null }));

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

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  embeddedSignupMock.mutateAsync = vi.fn();
  verifyMock.mutateAsync = vi.fn();
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EmbeddedSignupButton — pending_meta polling (A-10)", () => {
  it("consulta el estado cada 15s mientras el documento está visible", () => {
    render(<EmbeddedSignupButton integration={view({ status: "pending_meta" })} onSwitchToByo={vi.fn()} />);

    expect(screen.getByText(/Meta todavía está revisando tu número/)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(15_000));
    expect(verifyMock.mutateAsync).toHaveBeenCalledWith("twilio_whatsapp");

    act(() => vi.advanceTimersByTime(15_000));
    expect(verifyMock.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("se detiene cuando el documento queda oculto y se reanuda al volver a estar visible", () => {
    render(<EmbeddedSignupButton integration={view({ status: "pending_meta" })} onSwitchToByo={vi.fn()} />);

    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(30_000));
    expect(verifyMock.mutateAsync).not.toHaveBeenCalled();

    act(() => setVisibility("visible"));
    act(() => vi.advanceTimersByTime(15_000));
    expect(verifyMock.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("se detiene definitivamente tras 10 minutos y ofrece Actualizar estado", () => {
    render(<EmbeddedSignupButton integration={view({ status: "pending_meta" })} onSwitchToByo={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Actualizar estado" })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10 * 60 * 1000));
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();

    const callsAtTimeout = verifyMock.mutateAsync.mock.calls.length;
    act(() => vi.advanceTimersByTime(60_000));
    expect(verifyMock.mutateAsync).toHaveBeenCalledTimes(callsAtTimeout);

    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
    expect(verifyMock.mutateAsync).toHaveBeenCalledTimes(callsAtTimeout + 1);
  });
});
