import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_LAYOUT,
  normalizeLayoutConfig,
  renderEmailLayout,
  type EmailLayoutConfig
} from "./email-layout";

const VARS = {
  nombre: "María López",
  empresa: "Acme Cobranzas",
  monto: "$1.250.000 COP",
  link_pago: "https://pay.cobrai.dev/abc",
  due_date: "15 de junio de 2026"
};

function render(config: Partial<EmailLayoutConfig>, body = "Mensaje de la regla.") {
  return renderEmailLayout(config, { body, variables: VARS });
}

describe("renderEmailLayout", () => {
  it("produces a full email-safe HTML document", () => {
    const html = render(DEFAULT_EMAIL_LAYOUT);
    expect(html).toContain("<!DOCTYPE html");
    expect(html).toContain("<table");
    // ancho fijo del contenido
    expect(html).toContain("600px");
  });

  it("injects the rule body into the body block as paragraphs", () => {
    const html = render(
      { blocks: [{ id: "b", type: "body", props: {} }] },
      "Primera línea.\n\nSegunda línea."
    );
    expect(html).toContain("Primera línea.");
    expect(html).toContain("Segunda línea.");
    // dos párrafos separados por línea en blanco
    expect((html.match(/<p /g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("appends the body even when the layout has no body block (defensive)", () => {
    const html = render({ blocks: [{ id: "h", type: "heading", props: { text: "Hola" } }] }, "Cuerpo perdido");
    expect(html).toContain("Cuerpo perdido");
  });

  it("substitutes {{variables}} in heading/text/button", () => {
    const html = render({
      blocks: [
        { id: "h", type: "heading", props: { text: "{{empresa}}" } },
        { id: "t", type: "text", props: { text: "Hola {{nombre}}" } },
        { id: "btn", type: "button", props: { text: "Pagar", href: "{{link_pago}}" } }
      ]
    });
    expect(html).toContain("Acme Cobranzas");
    expect(html).toContain("Hola María López");
    expect(html).toContain('href="https://pay.cobrai.dev/abc"');
  });

  it("HTML-escapes variable values (anti-injection)", () => {
    const html = renderEmailLayout(
      { blocks: [{ id: "t", type: "text", props: { text: "Hola {{nombre}}" } }] },
      { body: "x", variables: { nombre: "<script>alert(1)</script>" } }
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the rule body too", () => {
    const html = render({ blocks: [{ id: "b", type: "body", props: {} }] }, "<b>hola</b>");
    expect(html).not.toContain("<b>hola</b>");
    expect(html).toContain("&lt;b&gt;hola&lt;/b&gt;");
  });

  it("renders a branded header bar when heading has backgroundColor", () => {
    const html = render({
      blocks: [{ id: "h", type: "heading", props: { text: "{{empresa}}", backgroundColor: "#D85A30", color: "#fff" } }]
    });
    expect(html).toContain("background:#D85A30");
  });

  it("renders the signature with company data and a default legal disclaimer", () => {
    const html = render({
      blocks: [{ id: "s", type: "signature", props: {} }],
      signature: { companyName: "Acme Cobranzas", phone: "+57 300 000", website: "acme.co" }
    });
    expect(html).toContain("Acme Cobranzas");
    expect(html).toContain("+57 300 000");
    expect(html).toContain("Ley 1266 de 2008");
  });

  it("uses a custom legal disclaimer when provided", () => {
    const html = render({
      blocks: [{ id: "s", type: "signature", props: {} }],
      signature: { legalDisclaimer: "Aviso personalizado del tenant." }
    });
    expect(html).toContain("Aviso personalizado del tenant.");
    expect(html).not.toContain("Ley 1266 de 2008");
  });

  it("DEFAULT_EMAIL_LAYOUT renders empresa, body and a payment button", () => {
    const html = render(DEFAULT_EMAIL_LAYOUT, "Su saldo está pendiente.");
    expect(html).toContain("Acme Cobranzas");
    expect(html).toContain("Su saldo está pendiente.");
    expect(html).toContain('href="https://pay.cobrai.dev/abc"');
  });
});

describe("normalizeLayoutConfig", () => {
  it("fills defaults for an empty draft", () => {
    const cfg = normalizeLayoutConfig({});
    expect(cfg.blocks).toEqual([]);
    expect(cfg.settings.contentWidth).toBe(600);
    expect(cfg.signature).toEqual({});
  });

  it("merges partial settings over defaults", () => {
    const cfg = normalizeLayoutConfig({ settings: { brandColor: "#000000" } as never });
    expect(cfg.settings.brandColor).toBe("#000000");
    expect(cfg.settings.fontFamily).toBe("Arial, Helvetica, sans-serif");
  });

  it("tolerates null/undefined", () => {
    expect(normalizeLayoutConfig(null).blocks).toEqual([]);
    expect(normalizeLayoutConfig(undefined).settings.contentWidth).toBe(600);
  });
});
