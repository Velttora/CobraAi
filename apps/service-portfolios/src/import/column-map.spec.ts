import { describe, expect, it } from "vitest";
import { buildColumnMapping, matchHeader } from "./column-map";

function fields(headers: string[]): Record<string, string | undefined> {
  const mapping = buildColumnMapping(headers);
  const out: Record<string, string | undefined> = {};
  for (const [idx, field] of mapping.byIndex) {
    out[field] = headers[idx];
  }
  return out;
}

describe("matchHeader", () => {
  it("mapea sinónimos comunes de monto", () => {
    expect(matchHeader("Saldo")).toBe("amount");
    expect(matchHeader("Vlr Deuda")).toBe("amount");
    expect(matchHeader("Importe adeudado")).toBe("amount");
  });

  it("mapea variantes de vencimiento", () => {
    expect(matchHeader("Fecha de Vencimiento")).toBe("due_date");
    expect(matchHeader("Vence")).toBe("due_date");
  });

  it("mapea nombre del deudor en distintos ERPs", () => {
    expect(matchHeader("Razón Social")).toBe("debtor_name");
    expect(matchHeader("Tercero")).toBe("debtor_name");
    expect(matchHeader("Customer Name")).toBe("debtor_name");
  });

  it("no mapea columnas irrelevantes", () => {
    expect(matchHeader("Vendedor")).not.toBe("debtor_name");
  });
});

describe("buildColumnMapping - resolución de ambigüedad", () => {
  it("prefiere el saldo a cobrar sobre la base sin impuestos", () => {
    const f = fields([
      "Número",
      "Cliente",
      "Importe sin impuestos en la moneda firmada",
      "Importe adeudado",
      "Fecha de vencimiento"
    ]);
    expect(f["amount"]).toBe("Importe adeudado");
  });

  it("mapea un export estilo Siigo", () => {
    const f = fields([
      "Nro Factura",
      "Razón Social",
      "Nit",
      "Saldo",
      "Fecha Vencimiento",
      "Teléfono"
    ]);
    expect(f["external_ref"]).toBe("Nro Factura");
    expect(f["debtor_name"]).toBe("Razón Social");
    expect(f["debtor_tax_id"]).toBe("Nit");
    expect(f["amount"]).toBe("Saldo");
    expect(f["due_date"]).toBe("Fecha Vencimiento");
    expect(f["debtor_phone"]).toBe("Teléfono");
  });

  it("reporta requeridos faltantes y columnas no reconocidas", () => {
    const mapping = buildColumnMapping(["Vendedor", "Zona", "Observaciones"]);
    expect(mapping.missingRequired).toContain("debtor_name");
    expect(mapping.missingRequired).toContain("amount");
    expect(mapping.missingRequired).toContain("due_date");
    expect(mapping.unmapped.map((u) => u.header)).toContain("Zona");
  });

  it("distingue fecha de factura de fecha de vencimiento", () => {
    const f = fields([
      "Cliente",
      "Valor",
      "Fecha factura",
      "Fecha de vencimiento"
    ]);
    expect(f["invoice_date"]).toBe("Fecha factura");
    expect(f["due_date"]).toBe("Fecha de vencimiento");
  });
});
