import { describe, expect, it } from "vitest";
import {
  buildTemplateVariableSamples,
  groupTemplateVariables,
  TEMPLATE_VARIABLE_CATALOG,
  TEMPLATE_VARIABLE_ALIAS_SAMPLES
} from "./template-variables";

describe("template-variables", () => {
  it("no duplica claves en el catálogo canónico", () => {
    const keys = TEMPLATE_VARIABLE_CATALOG.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("agrupa variables por categoría sin repetir categorías", () => {
    const groups = groupTemplateVariables();
    const categories = groups.map((g) => g.category);
    expect(new Set(categories).size).toBe(categories.length);
    expect(groups.find((g) => g.category === "Deuda")?.variables).toEqual([
      expect.objectContaining({ key: "referencia" })
    ]);
    expect(
      groups.find((g) => g.category === "Pago")?.variables.some((v) => v.key === "payment_link")
    ).toBe(false);
  });

  it("incluye alias en muestras de preview sin listarlos en el catálogo", () => {
    const samples = buildTemplateVariableSamples();
    expect(samples.referencia).toBe("FAC-00123");
    expect(samples.external_ref).toBe("FAC-00123");
    expect(samples.amount).toBe("1250000");
    expect(TEMPLATE_VARIABLE_CATALOG.some((v) => v.key === "amount")).toBe(false);
    expect(TEMPLATE_VARIABLE_ALIAS_SAMPLES.debtor_name).toBeDefined();
  });
});
