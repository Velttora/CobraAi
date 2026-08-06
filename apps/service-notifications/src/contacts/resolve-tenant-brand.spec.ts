import { describe, expect, it } from "vitest";
import { EMPRESA_FALLBACK } from "@cobrai/utils";
import { resolveTenantBrand } from "./resolve-tenant-brand";

describe("resolveTenantBrand", () => {
  it("uses commercialName when set", () => {
    const brand = resolveTenantBrand({
      name: "Acme Legal Name",
      settings: { brandIdentity: { commercialName: "Acme Cobranzas" } }
    });
    expect(brand.identity.commercialName).toBe("Acme Cobranzas");
    expect(brand.variables.empresa).toBe("Acme Cobranzas");
  });

  it("falls back to tenant.name when commercialName is unset", () => {
    const brand = resolveTenantBrand({ name: "Acme Legal Name", settings: {} });
    expect(brand.variables.empresa).toBe("Acme Legal Name");
  });

  it("falls back to EMPRESA_FALLBACK when neither is set", () => {
    const brand = resolveTenantBrand(null);
    expect(brand.variables.empresa).toBe(EMPRESA_FALLBACK);
  });

  it("never throws on a tenant without settings", () => {
    expect(() => resolveTenantBrand(undefined)).not.toThrow();
  });
});
