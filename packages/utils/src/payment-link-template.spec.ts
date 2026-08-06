import { describe, expect, it } from "vitest";
import {
  EXTERNAL_LINK_VARIABLES,
  resolveExternalLinkTemplate,
  validateExternalLinkTemplate
} from "./payment-link-template";

const SAMPLE_VALUES = { monto: "450000", ref: "FAC-00123", nombre: "María Rodríguez" };

describe("resolveExternalLinkTemplate", () => {
  it("substitutes {ref} and {monto} in a URL", () => {
    const result = resolveExternalLinkTemplate(
      "https://checkout.x.com/pagar?ref={ref}&valor={monto}",
      SAMPLE_VALUES
    );
    expect(result).toBe(
      `https://checkout.x.com/pagar?ref=${encodeURIComponent("FAC-00123")}&valor=450000`
    );
  });

  it("URL-encodes every value on substitution", () => {
    const result = resolveExternalLinkTemplate("https://x.com/pagar?nombre={nombre}", SAMPLE_VALUES);
    expect(result).toBe(`https://x.com/pagar?nombre=${encodeURIComponent("María Rodríguez")}`);
  });

  it("URL-encodes an & inside a reference so it does not break the query string", () => {
    const result = resolveExternalLinkTemplate("https://x.com/pagar?ref={ref}", {
      ...SAMPLE_VALUES,
      ref: "FAC-001&23"
    });
    expect(result).toBe(`https://x.com/pagar?ref=${encodeURIComponent("FAC-001&23")}`);
    expect(result).not.toContain("FAC-001&23");
  });

  it("substitutes a placeholder every time it appears", () => {
    const result = resolveExternalLinkTemplate("https://x.com/{ref}/confirm?ref={ref}", SAMPLE_VALUES);
    expect(result).toBe("https://x.com/FAC-00123/confirm?ref=FAC-00123");
  });

  it("leaves double-brace tokens untouched", () => {
    const result = resolveExternalLinkTemplate(
      "https://x.com/pagar?ref={ref}&legacy={{referencia}}",
      SAMPLE_VALUES
    );
    expect(result).toContain("{{referencia}}");
  });

  it("leaves an unknown single-brace token verbatim instead of an empty string", () => {
    const result = resolveExternalLinkTemplate("https://x.com/pagar?factura={factura}", SAMPLE_VALUES);
    expect(result).toBe("https://x.com/pagar?factura={factura}");
  });
});

describe("validateExternalLinkTemplate", () => {
  it("returns not_https when the template does not start with https://", () => {
    const errors = validateExternalLinkTemplate("http://checkout.x.com/pagar?ref={ref}");
    expect(errors).toContainEqual({ code: "not_https", message: "El enlace debe empezar con https://" });
  });

  it("returns no_reference when neither {ref} nor {monto} appears", () => {
    const errors = validateExternalLinkTemplate("https://checkout.x.com/pagar?nombre={nombre}");
    expect(errors).toContainEqual({
      code: "no_reference",
      message: "Incluye al menos {ref} para poder identificar el pago."
    });
  });

  it("does not flag no_reference when only {monto} is present", () => {
    const errors = validateExternalLinkTemplate("https://checkout.x.com/pagar?valor={monto}");
    expect(errors.some((e) => e.code === "no_reference")).toBe(false);
  });

  it("returns one unknown_variable error per unrecognized token, carrying the token name", () => {
    const errors = validateExternalLinkTemplate("https://x.com/pagar?ref={ref}&f={factura}&x={extra}");
    const unknown = errors.filter((e) => e.code === "unknown_variable");
    expect(unknown).toHaveLength(2);
    expect(unknown.map((e) => e.variable).sort()).toEqual(["extra", "factura"]);
    expect(unknown.find((e) => e.variable === "factura")?.message).toBe(
      "No reconocemos {factura}. Variables válidas: {monto}, {ref}, {nombre}."
    );
  });

  it("returns an empty array for a valid template", () => {
    const errors = validateExternalLinkTemplate("https://checkout.tuempresa.com/pagar?ref={ref}&valor={monto}");
    expect(errors).toEqual([]);
  });

  it("does not flag {{referencia}} as an unknown variable (double-brace pass-through)", () => {
    const errors = validateExternalLinkTemplate("https://x.com/pagar?ref={ref}&legacy={{referencia}}");
    expect(errors.some((e) => e.code === "unknown_variable")).toBe(false);
  });
});

describe("EXTERNAL_LINK_VARIABLES", () => {
  it("exposes exactly monto, ref and nombre", () => {
    expect(EXTERNAL_LINK_VARIABLES).toEqual(["monto", "ref", "nombre"]);
  });
});
