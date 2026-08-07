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

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

function stubFacebookEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_FACEBOOK_APP_ID", "app-123");
  vi.stubEnv("NEXT_PUBLIC_FACEBOOK_CONFIG_ID", "config-456");
}

beforeEach(() => {
  capturedScriptProps = {};
  embeddedSignupMock.mutateAsync = vi.fn();
  verifyMock.mutateAsync = vi.fn();
  toastError.mockClear();
  vi.unstubAllEnvs();
  delete (window as unknown as { FB?: unknown }).FB;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("EmbeddedSignupButton — sdk_unavailable", () => {
  // Sin app de Meta registrada no hay nada que el tenant pueda destrabar en su
  // navegador: culpar a una extensión lo manda a perseguir un problema ajeno.
  it("sin las variables de entorno, dice que la conexión asistida no está habilitada", () => {
    render(<EmbeddedSignupButton integration={undefined} onSwitchToByo={vi.fn()} />);

    expect(
      screen.getByText(/todavía no está habilitada en esta instalación/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/extensión del navegador/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conectar con WhatsApp" })).not.toBeInTheDocument();
  });

  it("el enlace de fallback cambia la tarjeta a BYO", () => {
    const onSwitchToByo = vi.fn();
    render(<EmbeddedSignupButton integration={undefined} onSwitchToByo={onSwitchToByo} />);

    fireEvent.click(screen.getByRole("button", { name: "Conectar con mis propias credenciales" }));
    expect(onSwitchToByo).toHaveBeenCalledTimes(1);
  });

  // Con la app configurada, un fallo de carga SÍ puede ser un bloqueador del
  // navegador — ahí el aviso original es el correcto.
  it("si el script de Meta falla al cargar (onError), sí apunta al navegador", () => {
    stubFacebookEnv();
    render(<EmbeddedSignupButton integration={undefined} onSwitchToByo={vi.fn()} />);

    act(() => capturedScriptProps.onError?.());
    expect(screen.getByText(/extensión del navegador/)).toBeInTheDocument();
  });
});

describe("EmbeddedSignupButton — sdk_loading / ready", () => {
  it("mientras carga, el botón está deshabilitado con Cargando… y un spinner", () => {
    stubFacebookEnv();
    const { container } = render(<EmbeddedSignupButton integration={undefined} onSwitchToByo={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Cargando…" });
    expect(button).toBeDisabled();
    expect(container.querySelector("svg.lucide-loader-circle")).toBeInTheDocument();
  });

  it("en ready, muestra Conectar con WhatsApp con chrome neutral y el glifo verde", () => {
    stubFacebookEnv();
    render(<EmbeddedSignupButton integration={undefined} onSwitchToByo={vi.fn()} />);

    window.FB = { init: vi.fn(), login: vi.fn() };
    act(() => capturedScriptProps.onLoad?.());

    const button = screen.getByRole("button", { name: "Conectar con WhatsApp" });
    expect(button).not.toBeDisabled();
    expect(button.className).not.toContain("bg-[#D85A30]");
    expect(button.querySelector("svg")?.getAttribute("class")).toContain("text-[#25D366]");
  });
});

describe("EmbeddedSignupButton — popup", () => {
  function readyButtonSetup(): { login: ReturnType<typeof vi.fn> } {
    stubFacebookEnv();
    const login = vi.fn();
    render(<EmbeddedSignupButton integration={undefined} onSwitchToByo={vi.fn()} />);
    window.FB = { init: vi.fn(), login };
    act(() => capturedScriptProps.onLoad?.());
    return { login };
  }

  it("clic abre el popup: botón deshabilitado con el enlace de reintento", () => {
    const { login } = readyButtonSetup();

    fireEvent.click(screen.getByRole("button", { name: "Conectar con WhatsApp" }));
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Continúa en la ventana de Meta…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "¿No se abrió? Reintentar" })).toBeInTheDocument();
  });

  it("cancelar el popup vuelve a ready sin toast ni estilos de error", () => {
    readyButtonSetup();
    fireEvent.click(screen.getByRole("button", { name: "Conectar con WhatsApp" }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://www.facebook.com",
          data: { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" }
        })
      );
    });

    expect(screen.getByText("Cancelaste la conexión. Puedes intentarlo de nuevo cuando quieras.")).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // El origen se compara exacto contra los que Meta sirve. `evil-facebook.com`
  // y `facebook.com.evil.io` son los casos que un `endsWith("facebook.com")`
  // dejaba pasar: bastaban para que una página a la que se atrae a un admin
  // autenticado forjara un FINISH y repuntara el canal de WhatsApp del tenant.
  it.each([
    "https://evil.example.com",
    "https://evil-facebook.com",
    "https://facebook.com.evil.io",
    "http://www.facebook.com",
    "https://notfacebook.com"
  ])("ignora un postMessage forjado desde %s", (origin) => {
    readyButtonSetup();
    fireEvent.click(screen.getByRole("button", { name: "Conectar con WhatsApp" }));

    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        data: { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" }
      })
    );

    // Sigue en popup_open — el mensaje forjado fue ignorado.
    expect(screen.getByText("Continúa en la ventana de Meta…")).toBeInTheDocument();
  });

  it.each([
    "https://www.facebook.com",
    "https://web.facebook.com",
    "https://business.facebook.com"
  ])("acepta un postMessage legítimo desde %s", (origin) => {
    readyButtonSetup();
    fireEvent.click(screen.getByRole("button", { name: "Conectar con WhatsApp" }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          data: { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" }
        })
      );
    });

    expect(
      screen.getByText("Cancelaste la conexión. Puedes intentarlo de nuevo cuando quieras.")
    ).toBeInTheDocument();
  });
});
