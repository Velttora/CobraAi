import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { type ImportRow } from "./csv-parser.service";

/**
 * Detecta y parsea archivos Excel en dos formatos:
 *
 * 1. Formato SIMPLE (headers en fila 1): columnas con los mismos nombres que el CSV.
 * 2. Formato CARTERA ("RELACION DE CUENTAS POR COBRAR"):
 *    - Secciones por empresa deudora (celdas combinadas repiten el nombre en toda la fila)
 *    - Columnas fijas: A=Fecha Factura, B=Fecha Radicado, C=No.Fact.,
 *                     D=Vencimiento, E=Valor, F=Retefuente, G=ICA,
 *                     H=Abonos, I=Tt.CxC (monto neto)
 *    - Sin columnas de contacto → se aplican valores por defecto
 */
@Injectable()
export class XlsxParserService {
  // Marcadores que identifican el formato cartera en las primeras filas
  private static readonly CARTERA_MARKERS = [
    "relacion de cuentas",
    "cuentas por cobrar",
    "fecha factura",
    "fecha radicado",
    "tt. c x c",
    "tt.cxc",
  ];

  // Palabras que indican que una fila NO es un header de sección ni dato
  private static readonly SKIP_ROW_STRINGS = [
    "fecha factura",
    "fecha radicado",
    "relacion de cuentas",
    "cuentas por cobrar",
    "totales",
    "total",
  ];

  async parse(
    buffer: Buffer,
    defaults: { email?: string; phone?: string; name?: string } = {}
  ): Promise<ImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    if (this.isCarteraFormat(sheet)) {
      return this.parseCartera(sheet, defaults);
    }
    return this.parseSimple(sheet);
  }

  // ── Detección de formato ─────────────────────────────────────────────────

  private isCarteraFormat(sheet: ExcelJS.Worksheet): boolean {
    // Revisa las primeras 10 filas buscando marcadores del formato cartera
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      for (let c = 1; c <= 10; c++) {
        const val = this.rawValue(row.getCell(c));
        if (typeof val === "string") {
          const lower = val.toLowerCase();
          if (
            XlsxParserService.CARTERA_MARKERS.some((m) => lower.includes(m))
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // ── Parser formato cartera ───────────────────────────────────────────────

  private parseCartera(
    sheet: ExcelJS.Worksheet,
    defaults: { email?: string; phone?: string; name?: string }
  ): ImportRow[] {
    const rows: ImportRow[] = [];
    let currentDebtor = defaults.name ?? "";

    sheet.eachRow((row) => {
      // Col A(1): Fecha Factura texto "dd/mm/yyyy" | o nombre empresa (merged)
      // Col B(2): Fecha Radicado Date              | o nombre empresa (merged)
      // Col C(3): No. Fact.  → external_ref
      // Col D(4): Vencimiento (Date) → due_date
      // Col I(9): Tt. C x C (number) → amount
      const a = this.rawValue(row.getCell(1));
      const b = this.rawValue(row.getCell(2));
      const c = this.rawValue(row.getCell(3));
      const d = this.rawValue(row.getCell(4));
      const i = this.rawValue(row.getCell(9));

      // Header de sección: celdas combinadas → col A y B tienen el mismo texto
      // Excluir explícitamente fechas (dd/mm/yyyy o ISO) para que no se confundan
      // con nombres de empresa cuando ambas columnas almacenan la misma fecha como texto.
      if (
        typeof a === "string" &&
        typeof b === "string" &&
        a.trim() === b.trim() &&
        a.trim().length > 0 &&
        !this.isDateLike(a.trim()) &&
        !XlsxParserService.SKIP_ROW_STRINGS.some((s) =>
          a.toLowerCase().includes(s)
        )
      ) {
        currentDebtor = a.trim();
        return;
      }

      // Fila de dato: col A o B tiene fecha, col C tiene ref de factura
      if (
        (this.isDateLike(a) || this.isDateLike(b)) &&
        typeof c === "string" &&
        c.trim().length > 0
      ) {
        const amount = typeof i === "number" ? i : 0;
        if (amount <= 0) return;

        const invoiceDateSrc = this.isDateLike(a) ? a : b;

        rows.push({
          external_ref: c.trim(),
          debtor_name: currentDebtor || (defaults.name ?? ""),
          debtor_email: defaults.email,
          debtor_phone: defaults.phone,
          amount,
          currency: "COP",
          due_date: this.formatDate(d),
          invoice_date: this.formatDate(invoiceDateSrc),
        });
      }
    });

    return rows;
  }

  // ── Parser formato simple (headers en fila 1) ───────────────────────────

  private parseSimple(sheet: ExcelJS.Worksheet): ImportRow[] {
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, col) => {
      headers[col] = String(cell.value ?? "").trim().toLowerCase();
    });

    const rows: ImportRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, string> = {};
      row.eachCell((cell, col) => {
        const key = headers[col];
        if (key) record[key] = String(this.rawValue(cell) ?? "").trim();
      });

      if (!record["debtor_name"] && !record["amount"]) return; // fila vacía

      rows.push(this.mapSimpleRow(record));
    });
    return rows;
  }

  private mapSimpleRow(row: Record<string, string>): ImportRow {
    const amount = Number(row["amount"]);
    if (!row["debtor_name"] || !row["amount"] || !row["currency"] || !row["due_date"]) {
      throw new Error(
        "Fila incompleta: debtor_name, amount, currency, due_date son requeridos"
      );
    }
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error("amount debe ser un número positivo");
    }

    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith("metadata_")) {
        metadata[key.replace(/^metadata_/, "")] = value;
      }
    }

    return {
      external_ref: row["external_ref"],
      debtor_name: row["debtor_name"],
      debtor_tax_id: row["debtor_tax_id"],
      debtor_phone: row["debtor_phone"],
      debtor_email: row["debtor_email"],
      amount,
      currency: row["currency"].toUpperCase(),
      due_date: row["due_date"],
      scheduled_collection_date: row["scheduled_collection_date"] || undefined,
      payment_terms_days: row["payment_terms_days"]
        ? Number(row["payment_terms_days"])
        : undefined,
      invoice_date: row["invoice_date"] || undefined,
      debtor_type: row["debtor_type"],
      address_city: row["address_city"],
      address_country: row["address_country"],
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private rawValue(cell: ExcelJS.Cell): unknown {
    const v = cell.value;
    if (v !== null && typeof v === "object" && "result" in v) {
      return (v as ExcelJS.CellFormulaValue).result;
    }
    return v;
  }

  private isDateLike(v: unknown): boolean {
    if (v instanceof Date) return true;
    if (typeof v === "string") {
      return (
        /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.trim()) ||
        /^\d{4}-\d{2}-\d{2}T/.test(v.trim())
      );
    }
    return false;
  }

  private formatDate(v: unknown): string {
    if (v instanceof Date) return v.toISOString().split("T")[0]!;
    if (typeof v === "string") {
      const dmy = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) {
        const [, d, m, y] = dmy;
        return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
      }
      const iso = v.trim().match(/^(\d{4}-\d{2}-\d{2})T/);
      if (iso) return iso[1]!;
      return v;
    }
    return "";
  }
}
