import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_LAYOUT,
  normalizeLayoutConfig,
  renderEmailLayout,
  type EmailLayoutConfig
} from "./email-layout";
import { EMPTY_BRAND_IDENTITY, type BrandIdentity } from "./brand-identity";

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

  describe("brand identity read-through (UI-SPEC A-05)", () => {
    const config: Partial<EmailLayoutConfig> = {
      blocks: [{ id: "s", type: "signature", props: {} }],
      signature: {
        companyName: "Nombre Antiguo del Builder",
        phone: "+57 300 111",
        website: "antiguo.co",
        address: "Dirección antigua",
        legalDisclaimer: "Aviso antiguo del builder.",
        socials: [{ type: "instagram", url: "https://instagram.com/acme" }]
      }
    };
    const brand: BrandIdentity = {
      ...EMPTY_BRAND_IDENTITY,
      commercialName: "Acme Cobranzas S.A.S.",
      logoUrl: "https://cdn.acme.co/logo.png",
      supportPhone: "+57 300 999",
      website: "https://acme.co",
      address: "Nueva dirección de marca",
      legalNotice: "Nuevo aviso legal de marca."
    };

    it("brand identity overrides the stored signature fields it maps to", () => {
      const html = renderEmailLayout(config, { body: "x", variables: {}, brand });
      expect(html).toContain("Acme Cobranzas S.A.S.");
      expect(html).toContain("+57 300 999");
      expect(html).toContain("acme.co");
      expect(html).toContain("Nueva dirección de marca");
      expect(html).toContain("Nuevo aviso legal de marca.");
      expect(html).not.toContain("Nombre Antiguo del Builder");
      expect(html).not.toContain("Dirección antigua");
    });

    it("preserves socials untouched — they stay owned by the email builder", () => {
      const html = renderEmailLayout(config, { body: "x", variables: {}, brand });
      expect(html).toContain("https://instagram.com/acme");
    });

    it("a null brand field falls back to the stored signature value", () => {
      const partialBrand: BrandIdentity = { ...EMPTY_BRAND_IDENTITY, commercialName: "Acme Cobranzas S.A.S." };
      const html = renderEmailLayout(config, { body: "x", variables: {}, brand: partialBrand });
      // commercialName is set on the brand → wins
      expect(html).toContain("Acme Cobranzas S.A.S.");
      // every other field is null on the brand → the stored signature value survives
      expect(html).toContain("+57 300 111");
      expect(html).toContain("Dirección antigua");
      expect(html).toContain("Aviso antiguo del builder.");
    });

    it("anti-regression: existing rendering is unchanged when no brand identity is supplied", () => {
      const html = renderEmailLayout(config, { body: "x", variables: {} });
      expect(html).toContain("Nombre Antiguo del Builder");
      expect(html).toContain("Dirección antigua");
    });
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
