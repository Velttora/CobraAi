import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { EMPTY_BRAND_IDENTITY, type BrandIdentity } from "@cobrai/utils";
import { BrandMessagePreview } from "./BrandMessagePreview";
import type { IntegrationView } from "../../../lib/types";

const layoutPreviewMock = vi.fn();
vi.mock("../email-builder/LayoutPreview", () => ({
  LayoutPreview: (props: unknown) => {
    layoutPreviewMock(props);
    return <div data-testid="layout-preview-mock" />;
  }
}));

function draft(overrides: Partial<BrandIdentity> = {}): BrandIdentity {
  return { ...EMPTY_BRAND_IDENTITY, ...overrides };
}

function whatsappView(overrides: Partial<IntegrationView> = {}): IntegrationView {
  return {
    provider: "twilio_whatsapp",
    channel: "whatsapp",
    mode: "byo",
    status: "verified",
    verifiedAt: "2026-08-01T10:00:00Z",
    failureMessage: null,
    publicConfig: { phoneNumberE164: "+573001234567" },
    secrets: [],
    webhookUrl: null,
    ...overrides
  };
}

describe("BrandMessagePreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    layoutPreviewMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renderiza tres pestañas con semántica de tabs, WhatsApp por defecto", () => {
    render(
      <BrandMessagePreview draft={draft({ commercialName: "Acme" })} whatsappIntegration={null} />
    );

    expect(screen.getByRole("tablist", { name: "Vista previa por canal" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "WhatsApp" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("el pane de WhatsApp muestra un cuerpo real con empresa vinculado al draft", () => {
    render(
      <BrandMessagePreview
        draft={draft({ commercialName: "Acme Cobranzas" })}
        whatsappIntegration={null}
      />
    );
    expect(screen.getByText(/Acme Cobranzas/)).toBeInTheDocument();
  });

  it("el header de WhatsApp muestra 'Sin conectar' cuando no hay integración verificada", () => {
    render(<BrandMessagePreview draft={draft()} whatsappIntegration={null} />);
    expect(screen.getByText("Sin conectar")).toBeInTheDocument();
  });

  it("el header de WhatsApp muestra el número cuando está verificado", () => {
    render(<BrandMessagePreview draft={draft()} whatsappIntegration={whatsappView()} />);
    expect(screen.getByText("+573001234567")).toBeInTheDocument();
  });

  it("el pane de Correo envuelve LayoutPreview sin reimplementarlo, con la marca inyectada en la firma", () => {
    render(
      <BrandMessagePreview draft={draft({ commercialName: "Acme" })} whatsappIntegration={null} />
    );
    fireEvent.click(screen.getByRole("tab", { name: "Correo" }));

    expect(screen.getByTestId("layout-preview-mock")).toBeInTheDocument();
    expect(layoutPreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          signature: expect.objectContaining({ companyName: "Acme" })
        })
      })
    );
  });

  it("el pane de Voz interpola el nombre comercial en la línea de apertura", () => {
    render(
      <BrandMessagePreview draft={draft({ commercialName: "Acme" })} whatsappIntegration={null} />
    );
    fireEvent.click(screen.getByRole("tab", { name: "Voz" }));

    expect(screen.getByText(/le llamo de/)).toBeInTheDocument();
    expect(screen.getByText("Así se presenta el agente en la llamada.")).toBeInTheDocument();
  });

  it("la navegación con flechas mueve entre pestañas", () => {
    render(
      <BrandMessagePreview draft={draft({ commercialName: "Acme" })} whatsappIntegration={null} />
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "WhatsApp" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Correo" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Correo" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Voz" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Voz" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Correo" })).toHaveAttribute("aria-selected", "true");
  });

  it("cuando el nombre comercial está vacío, muestra el fallback real en cursiva sin token {placeholder}", () => {
    const { container } = render(
      <BrandMessagePreview draft={draft({ commercialName: null })} whatsappIntegration={null} />
    );

    expect(screen.getByText("su gestor de cobranza")).toBeInTheDocument();
    expect(container.textContent).not.toContain("{");
  });

  it("anuncia 'Vista previa actualizada' en una región aria-live cuando cambia el draft", () => {
    const { rerender, container } = render(
      <BrandMessagePreview draft={draft({ commercialName: "Acme" })} whatsappIntegration={null} />
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent("Vista previa actualizada");

    rerender(
      <BrandMessagePreview
        draft={draft({ commercialName: "Acme 2" })}
        whatsappIntegration={null}
      />
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(liveRegion).toHaveTextContent("Vista previa actualizada");
  });
});
