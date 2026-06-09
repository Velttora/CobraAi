import { describe, expect, it } from "vitest";
import { CsvParserService } from "./csv-parser.service";

describe("CsvParserService", () => {
  const parser = new CsvParserService();

  it("parses valid UTF-8 CSV", () => {
    const csv = Buffer.from(
      "external_ref,debtor_name,debtor_tax_id,debtor_phone,debtor_email,amount,currency,due_date\nREF-1,Juan,123,+573001234567,j@x.com,1000,COP,2026-01-15",
      "utf-8"
    );
    const { rows } = parser.parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.debtor_name).toBe("Juan");
    expect(rows[0]?.currency).toBe("COP");
  });

  it("mapea headers en español de cualquier ERP y default COP", () => {
    const csv = Buffer.from(
      "Nro Factura,Razon Social,Saldo,Fecha Vencimiento\nA-1,ACME SAS,1.500.000,2026-03-20",
      "utf-8"
    );
    const { rows } = parser.parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.debtor_name).toBe("ACME SAS");
    expect(rows[0]?.amount).toBe(1500000);
    expect(rows[0]?.currency).toBe("COP");
    expect(rows[0]?.due_date).toBe("2026-03-20");
  });

  it("tolera líneas de título antes del encabezado", () => {
    const csv = Buffer.from(
      "REPORTE DE CARTERA\nGenerado 2026-06-09\n\nCliente,Monto,Vencimiento\nJuan,1000,2026-01-15",
      "utf-8"
    );
    const { rows } = parser.parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.debtor_name).toBe("Juan");
  });

  it("salta filas sin datos en vez de abortar", () => {
    const csv = Buffer.from(
      "Cliente,Monto,Vencimiento\nJuan,1000,2026-01-15\nTOTAL,,\n",
      "utf-8"
    );
    const { rows } = parser.parseCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it("lanza error claro si faltan columnas requeridas", () => {
    const csv = Buffer.from("Vendedor,Zona\nJuan,Norte", "utf-8");
    expect(() => parser.parseCsv(csv)).toThrow(/No se reconocieron columnas/);
  });
});
