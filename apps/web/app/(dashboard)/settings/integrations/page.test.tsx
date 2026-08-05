import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import IntegrationsChannelsPage from "./page";
import type { IntegrationView } from "../../../../lib/types";

const useAuthMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({ useAuth: () => useAuthMock() }));

const getFocusMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => getFocusMock(key) })
}));

const useIntegrationsMock = vi.fn();
const saveMock = { mutateAsync: vi.fn(), isPending: false };
const verifyMock = { mutateAsync: vi.fn(), isPending: false };
const disconnectMock = { mutateAsync: vi.fn(), isPending: false };
const recheckDnsMock = { mutateAsync: vi.fn(), isPending: false };
vi.mock("../../../../hooks/use-integrations", () => ({
  useIntegrations: () => useIntegrationsMock(),
  useSaveIntegration: () => saveMock,
  useVerifyIntegration: () => verifyMock,
  useDisconnectIntegration: () => disconnectMock,
  useRecheckDns: () => recheckDnsMock
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

beforeEach(() => {
  useAuthMock.mockReturnValue({ orgRole: "org:admin" });
  getFocusMock.mockReturnValue(null);
});

describe("IntegrationsChannelsPage", () => {
  it("renderiza las tres tarjetas en el orden fijo WhatsApp, Teléfono, Correo", () => {
    useIntegrationsMock.mockReturnValue({
      isLoading: false,
      data: {
        data: {
          items: [
            view({ provider: "twilio_whatsapp", channel: "whatsapp" }),
            view({ provider: "twilio_voice", channel: "voice" }),
            view({ provider: "sendgrid", channel: "email" })
          ]
        }
      }
    });

    render(<IntegrationsChannelsPage />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["WhatsApp", "Teléfono (llamadas)", "Correo"]);
  });

  it("pasa la integración de WhatsApp verificada a la tarjeta de Teléfono como relatedIntegration", () => {
    useIntegrationsMock.mockReturnValue({
      isLoading: false,
      data: {
        data: {
          items: [
            view({
              provider: "twilio_whatsapp",
              channel: "whatsapp",
              mode: "managed",
              status: "verified",
              publicConfig: { fromNumber: "whatsapp:+573001234567" }
            }),
            view({ provider: "twilio_voice", channel: "voice", mode: "managed" }),
            view({ provider: "sendgrid", channel: "email" })
          ]
        }
      }
    });

    render(<IntegrationsChannelsPage />);

    // Teléfono's "Activar llamadas" is only enabled once its related
    // WhatsApp card is verified — proving the prop reached ChannelCard.
    const activar = screen.getByRole("button", { name: "Activar llamadas" });
    expect(activar).not.toBeDisabled();
  });

  it("muestra un Skeleton mientras la consulta está cargando", () => {
    useIntegrationsMock.mockReturnValue({ isLoading: true, data: undefined });
    render(<IntegrationsChannelsPage />);
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });
});
