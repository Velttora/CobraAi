import { describe, expect, it } from "vitest";
import {
  normalizeCurrency,
  parseAmount,
  parseDate,
  parsePercentage,
} from "./value-parsers";

describe("parseAmount", () => {
  it("acepta separadores LatAm/EU", () => {
    expect(parseAmount("1.234.567,89")).toBeCloseTo(1234567.89, 2);
  });

  it("acepta separadores US", () => {
    expect(parseAmount("1,234,567.89")).toBeCloseTo(1234567.89, 2);
  });

  it("acepta símbolos de moneda y espacios", () => {
    expect(parseAmount("$ 1.500.000")).toBe(1500000);
  });

  it("interpreta negativos con paréntesis y sufijo", () => {
    expect(parseAmount("(1.234)")).toBe(-1234);
    expect(parseAmount("1.234-")).toBe(-1234);
  });

  it("mantiene números puros", () => {
    expect(parseAmount(869541.01)).toBe(869541.01);
    expect(parseAmount("1500000")).toBe(1500000);
  });

  it("devuelve NaN para texto no numérico", () => {
    expect(Number.isNaN(parseAmount("N/A"))).toBe(true);
  });
});

describe("parseDate", () => {
  it("convierte Date a YYYY-MM-DD (UTC)", () => {
    expect(parseDate(new Date("2026-07-14T00:00:00.000Z"))).toBe("2026-07-14");
  });

  it("acepta dd/mm/yyyy", () => {
    expect(parseDate("14/07/2026")).toBe("2026-07-14");
  });

  it("acepta dd-mm-yyyy y dd.mm.yyyy", () => {
    expect(parseDate("14-07-2026")).toBe("2026-07-14");
    expect(parseDate("14.07.2026")).toBe("2026-07-14");
  });

  it("acepta yyyymmdd y yyyy-mm-dd", () => {
    expect(parseDate("20260714")).toBe("2026-07-14");
    expect(parseDate("2026-07-14")).toBe("2026-07-14");
  });

  it("acepta ISO con tiempo", () => {
    expect(parseDate("2026-05-30T00:00:00.000Z")).toBe("2026-05-30");
  });

  it("acepta serial de Excel", () => {
    // 45292 = 2024-01-01 en el sistema de fechas 1900 de Excel
    expect(parseDate(45292)).toBe("2024-01-01");
  });

  it("acepta mm/dd cuando el día > 12", () => {
    expect(parseDate("07/25/2026")).toBe("2026-07-25");
  });

  it("acepta mes en texto", () => {
    expect(parseDate("14-jul-2026")).toBe("2026-07-14");
  });

  it("devuelve cadena vacía para basura", () => {
    expect(parseDate("no es fecha")).toBe("");
  });
});

describe("parsePercentage", () => {
  it("interpreta la fracción de Excel como porcentaje", () => {
    expect(parsePercentage(0.05)).toBe(5);
    expect(parsePercentage(0.15)).toBe(15);
  });

  it("mantiene porcentajes literales", () => {
    expect(parsePercentage(5)).toBe(5);
    expect(parsePercentage("15")).toBe(15);
  });

  it("acepta símbolo de porcentaje y separador LatAm", () => {
    expect(parsePercentage("5%")).toBe(5);
    expect(parsePercentage("0,5%")).toBe(0.5);
    expect(parsePercentage("0,05")).toBe(5);
  });

  it("devuelve NaN para valores vacíos o no numéricos", () => {
    expect(Number.isNaN(parsePercentage(""))).toBe(true);
    expect(Number.isNaN(parsePercentage(null))).toBe(true);
    expect(Number.isNaN(parsePercentage("N/A"))).toBe(true);
  });
});

describe("normalizeCurrency", () => {
  it("default COP cuando viene vacío", () => {
    expect(normalizeCurrency("")).toBe("COP");
    expect(normalizeCurrency(undefined)).toBe("COP");
  });

  it("respeta ISO de 3 letras", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
  });

  it("mapea nombres comunes", () => {
    expect(normalizeCurrency("Pesos")).toBe("COP");
    expect(normalizeCurrency("dólares")).toBe("USD");
  });
});
