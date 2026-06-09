import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { XlsxParserService } from "./xlsx-parser.service";

async function buildBuffer(
  rows: (string | number | Date | null)[][]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  rows.forEach((r) => ws.addRow(r));
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

describe("XlsxParserService", () => {
  const parser = new XlsxParserService();

  it("parsea una exportación Odoo account.move (headers en español + fechas Date)", async () => {
    const buffer = await buildBuffer([
      [
        "Número",
        "Nombre de la empresa a mostrar en la factura",
        "Fecha de factura",
        "Fecha de vencimiento",
        "Importe sin impuestos en la moneda firmada",
        "Importe adeudado",
        "Estado en pago",
        "Asociado/Condiciones de pago de cliente",
        "Asociado/Dirección completa",
        "Asociado/Teléfono"
      ],
      [
        "FE73452",
        "VICTOR ALEJANDRO ESPAÑA ARENAS",
        new Date("2026-05-30T00:00:00.000Z"),
        new Date("2026-07-14T00:00:00.000Z"),
        730706.73,
        869541.01,
        "Sin pagar",
        "45 Días",
        "Calle 10 #19-49",
        "3103950786"
      ]
    ]);

    const { rows } = await parser.parse(buffer);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.external_ref).toBe("FE73452");
    expect(row.debtor_name).toBe("VICTOR ALEJANDRO ESPAÑA ARENAS");
    expect(row.amount).toBe(869541.01);
    expect(row.currency).toBe("COP");
    expect(row.due_date).toBe("2026-07-14");
    expect(row.invoice_date).toBe("2026-05-30");
    expect(row.debtor_phone).toBe("3103950786");
    expect(row.metadata?.["estado_en_pago"]).toBe("Sin pagar");
  });

  it("detecta la fila de encabezados cuando hay títulos arriba (estilo SAP/Helisa)", async () => {
    const buffer = await buildBuffer([
      ["RELACION DE CARTERA - EMPRESA XYZ S.A.S", null, null, null],
      ["Generado: 2026-06-09", null, null, null],
      [],
      ["Cliente", "NIT", "Saldo", "Fecha Vto"],
      ["FERREMUNDO SAS", "900123456", "1.250.000,50", "31/07/2026"],
      ["TOTAL", null, "1.250.000,50", null]
    ]);

    const { rows } = await parser.parse(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.debtor_name).toBe("FERREMUNDO SAS");
    expect(rows[0]?.debtor_tax_id).toBe("900123456");
    expect(rows[0]?.amount).toBeCloseTo(1250000.5, 2);
    expect(rows[0]?.due_date).toBe("2026-07-31");
  });

  it("parsea estilo Siigo con montos US y avisa columnas no reconocidas", async () => {
    const buffer = await buildBuffer([
      ["Nro Factura", "Razon Social", "Valor", "Fecha Vencimiento", "Zona"],
      ["A-100", "INVERSIONES ABC", "1,500,000.00", "2026-08-15", "Norte"]
    ]);

    const { rows, warnings } = await parser.parse(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.external_ref).toBe("A-100");
    expect(rows[0]?.amount).toBe(1500000);
    expect(rows[0]?.metadata?.["zona"]).toBe("Norte");
    expect(warnings.join(" ")).toContain("Zona");
  });

  it("omite filas sin datos (totales/vacías) sin abortar la importación", async () => {
    const buffer = await buildBuffer([
      ["Cliente", "Fecha de vencimiento", "Importe adeudado"],
      ["ACME SAS", new Date("2026-07-14T00:00:00.000Z"), 1000],
      ["", null, null],
      ["TOTAL", null, 999999]
    ]);

    const { rows } = await parser.parse(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.debtor_name).toBe("ACME SAS");
  });

  it("lanza error claro si faltan columnas requeridas", async () => {
    const buffer = await buildBuffer([
      ["Vendedor", "Zona", "Observaciones"],
      ["Juan", "Norte", "nota"]
    ]);

    await expect(parser.parse(buffer)).rejects.toThrow(
      /No se reconocieron columnas/
    );
  });

  it("usa la moneda indicada cuando viene en el archivo", async () => {
    const buffer = await buildBuffer([
      ["Nombre", "Monto", "Moneda", "Vencimiento"],
      ["Juan", 500, "usd", "2026-01-15"]
    ]);

    const { rows } = await parser.parse(buffer);
    expect(rows[0]?.currency).toBe("USD");
  });
});
