import { describe, expect, it } from "vitest";
import {
  EMPRESA_FALLBACK,
  EMPTY_BRAND_IDENTITY,
  resolveBrandVariables,
  sanitizeBrandIdentity,
  type BrandIdentity
} from "./brand-identity";

describe("sanitizeBrandIdentity", () => {
  it("trims every string field and converts empty/whitespace-only to null", () => {
    const identity = sanitizeBrandIdentity({
      commercialName: "  Acme Cobranzas  ",
      supportPhone: "   ",
      supportEmail: "",
      address: "\n  Calle 1 #2-3  \n"
    });

    expect(identity.commercialName).toBe("Acme Cobranzas");
    expect(identity.supportPhone).toBeNull();
    expect(identity.supportEmail).toBeNull();
    expect(identity.address).toBe("Calle 1 #2-3");
  });

  it("returns EMPTY_BRAND_IDENTITY rather than throwing on undefined", () => {
    expect(sanitizeBrandIdentity(undefined)).toEqual(EMPTY_BRAND_IDENTITY);
  });

  it("never throws on malformed input (numbers, arrays, null)", () => {
    expect(() => sanitizeBrandIdentity(null)).not.toThrow();
    expect(() => sanitizeBrandIdentity(42)).not.toThrow();
    expect(() => sanitizeBrandIdentity(["not", "an", "object"])).not.toThrow();
    expect(sanitizeBrandIdentity(42)).toEqual(EMPTY_BRAND_IDENTITY);
  });

  it("ignores unknown keys", () => {
    const identity = sanitizeBrandIdentity({
      commercialName: "Acme",
      secretApiKey: "should-never-appear"
    } as unknown);
    expect(identity).not.toHaveProperty("secretApiKey");
  });

  it("nulls a javascript: logoUrl (anti-injection, T-08-15a)", () => {
    const identity = sanitizeBrandIdentity({ logoUrl: "javascript:alert(1)" });
    expect(identity.logoUrl).toBeNull();
  });

  it("nulls a data: website", () => {
    const identity = sanitizeBrandIdentity({ website: "data:text/html,<script>1</script>" });
    expect(identity.website).toBeNull();
  });

  it("accepts http:// and https:// URLs", () => {
    const identity = sanitizeBrandIdentity({
      logoUrl: "https://cdn.acme.co/logo.png",
      website: "http://acme.co"
    });
    expect(identity.logoUrl).toBe("https://cdn.acme.co/logo.png");
    expect(identity.website).toBe("http://acme.co");
  });
});

describe("resolveBrandVariables", () => {
  it("falls back to EMPRESA_FALLBACK when commercialName is null", () => {
    const vars = resolveBrandVariables(EMPTY_BRAND_IDENTITY);
    expect(vars.empresa).toBe(EMPRESA_FALLBACK);
  });

  it("uses the trimmed commercial name when set", () => {
    const identity: BrandIdentity = { ...EMPTY_BRAND_IDENTITY, commercialName: "Acme Cobranzas" };
    expect(resolveBrandVariables(identity).empresa).toBe("Acme Cobranzas");
  });

  it("returns an empty string, never null/undefined, for every unset optional field", () => {
    const vars = resolveBrandVariables(EMPTY_BRAND_IDENTITY);
    expect(vars.empresa_telefono).toBe("");
    expect(vars.empresa_correo).toBe("");
    expect(vars.empresa_sitio_web).toBe("");
    expect(vars.empresa_razon_social).toBe("");
    expect(vars.empresa_nit).toBe("");
    expect(vars.empresa_aviso_legal).toBe("");
    for (const value of Object.values(vars)) {
      expect(value).not.toBeNull();
      expect(value).not.toBeUndefined();
    }
  });

  it("carries through every set field", () => {
    const identity: BrandIdentity = {
      commercialName: "Acme Cobranzas",
      logoUrl: "https://cdn.acme.co/logo.png",
      supportPhone: "+57 300 000",
      supportEmail: "hola@acme.co",
      website: "https://acme.co",
      address: "Calle 1 #2-3",
      legalName: "Acme Cobranzas S.A.S.",
      taxId: "900123456-7",
      legalNotice: "Aviso legal de Acme."
    };
    const vars = resolveBrandVariables(identity);
    expect(vars).toEqual({
      empresa: "Acme Cobranzas",
      empresa_telefono: "+57 300 000",
      empresa_correo: "hola@acme.co",
      empresa_sitio_web: "https://acme.co",
      empresa_razon_social: "Acme Cobranzas S.A.S.",
      empresa_nit: "900123456-7",
      empresa_aviso_legal: "Aviso legal de Acme."
    });
  });
});
