import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { type ImportRow, type ParseResult } from "./csv-parser.service";
import {
  buildColumnMapping,
  metadataKeyFor,
  REQUIRED_FIELDS,
} from "./column-map";
import { buildImportRow } from "./row-builder";
import { parseAmount, parseDate } from "./value-parsers";

/**
 * Parser de archivos Excel multi-ERP. Detecta dos estructuras:
 *
 * 1. Formato CARTERA ("RELACION DE CUENTAS POR COBRAR"): secciones por empresa
 *    con columnas fijas posicionales y sin encabezados estándar.
 * 2. Formato por ENCABEZADOS (la mayoría de ERPs: SAP, Siigo, Odoo, Helisa…):
 *    se localiza la fila de encabezados (aunque haya títulos arriba) y se mapea
 *    cada columna al esquema canónico con `buildColumnMapping`.
 */
@Injectable()
export class XlsxParserService {
  private static readonly CARTERA_MARKERS = [
    "relacion de cuentas",
    "cuentas por cobrar",
    "fecha factura",
    "fecha radicado",
    "tt. c x c",
    "tt.cxc",
  ];

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
  ): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { rows: [], warnings: [] };

    if (this.isCarteraFormat(sheet)) {
      return { rows: this.parseCartera(sheet, defaults), warnings: [] };
    }
    return this.parseByHeaders(sheet);
  }

  // ── Detección de formato ─────────────────────────────────────────────────

  private isCarteraFormat(sheet: ExcelJS.Worksheet): boolean {
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

  // ── Parser por encabezados (genérico multi-ERP) ──────────────────────────

  private parseByHeaders(sheet: ExcelJS.Worksheet): ParseResult {
    const header = this.detectHeaderRow(sheet);
    const mapping = buildColumnMapping(header.headers);

    if (mapping.missingRequired.length > 0) {
      const detected = header.headers.filter((h) => h.trim().length > 0);
      throw new Error(
        `No se reconocieron columnas para: ${mapping.missingRequired.join(
          ", "
        )}. Encabezados detectados: ${detected.join(" | ") || "(ninguno)"}. ` +
          "Renombra las columnas o usa la plantilla de CobraAI."
      );
    }

    const warnings: string[] = [];
    if (mapping.unmapped.length > 0) {
      warnings.push(
        `Columnas no reconocidas (guardadas como metadata): ${mapping.unmapped
          .map((u) => u.header)
          .join(", ")}`
      );
    }

    const rows: ImportRow[] = [];
    for (let r = header.rowNumber + 1; r <= sheet.rowCount; r++) {
      const excelRow = sheet.getRow(r);
      const mapped = this.mapRow(excelRow, header.headers, mapping);
      if (mapped) rows.push(mapped);
    }

    return { rows, warnings };
  }

  /**
   * Localiza la fila de encabezados escaneando las primeras filas y eligiendo
   * la que mapea más columnas (muchos ERPs ponen títulos/metadatos arriba).
   */
  private detectHeaderRow(sheet: ExcelJS.Worksheet): {
    rowNumber: number;
    headers: string[];
  } {
    const maxScan = Math.min(15, sheet.rowCount);
    let best = { rowNumber: 1, headers: [] as string[], score: -1 };

    for (let r = 1; r <= maxScan; r++) {
      const headers = this.readRowStrings(sheet.getRow(r));
      if (headers.every((h) => h.trim().length === 0)) continue;
      const mapping = buildColumnMapping(headers);
      const matched = mapping.byIndex.size;
      const requiredHit = REQUIRED_FIELDS.filter((f) =>
        [...mapping.byIndex.values()].includes(f)
      ).length;
      const score = matched + requiredHit * 3;
      if (score > best.score) {
        best = { rowNumber: r, headers, score };
      }
    }

    return { rowNumber: best.rowNumber, headers: best.headers };
  }

  private mapRow(
    excelRow: ExcelJS.Row,
    headers: string[],
    mapping: ReturnType<typeof buildColumnMapping>
  ): ImportRow | null {
    const fields: Record<string, unknown> = {};
    const metadata: Record<string, string> = {};

    for (let i = 0; i < headers.length; i++) {
      const cell = excelRow.getCell(i + 1);
      const raw = this.rawValue(cell);
      const field = mapping.byIndex.get(i);
      if (field) {
        fields[field] = raw;
      } else if (headers[i]?.trim()) {
        const text =
          raw instanceof Date ? parseDate(raw) : String(raw ?? "").trim();
        if (text) {
          metadata[metadataKeyFor(headers[i]!).replace(/^metadata_/, "")] = text;
        }
      }
    }

    return buildImportRow(fields, metadata);
  }

  // ── Parser formato cartera (posicional) ──────────────────────────────────

  private parseCartera(
    sheet: ExcelJS.Worksheet,
    defaults: { email?: string; phone?: string; name?: string }
  ): ImportRow[] {
    const rows: ImportRow[] = [];
    let currentDebtor = defaults.name ?? "";

    sheet.eachRow((row) => {
      const a = this.rawValue(row.getCell(1));
      const b = this.rawValue(row.getCell(2));
      const c = this.rawValue(row.getCell(3));
      const d = this.rawValue(row.getCell(4));
      const i = this.rawValue(row.getCell(9));

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

      if (
        (this.isDateLike(a) || this.isDateLike(b)) &&
        typeof c === "string" &&
        c.trim().length > 0
      ) {
        const amount = typeof i === "number" ? i : parseAmount(i);
        if (Number.isNaN(amount) || amount <= 0) return;

        const invoiceDateSrc = this.isDateLike(a) ? a : b;

        rows.push({
          external_ref: c.trim(),
          debtor_name: currentDebtor || (defaults.name ?? ""),
          debtor_email: defaults.email,
          debtor_phone: defaults.phone,
          amount,
          currency: "COP",
          due_date: parseDate(d),
          invoice_date: parseDate(invoiceDateSrc),
        });
      }
    });

    return rows;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private readRowStrings(row: ExcelJS.Row): string[] {
    const out: string[] = [];
    const count = row.cellCount || 0;
    for (let c = 1; c <= count; c++) {
      const raw = this.rawValue(row.getCell(c));
      out[c - 1] = raw == null ? "" : String(raw).trim();
    }
    return out;
  }

  private cellText(v: unknown): string {
    if (v == null) return "";
    if (v instanceof Date) return parseDate(v);
    return String(v).trim();
  }

  private rawValue(cell: ExcelJS.Cell): unknown {
    const v = cell.value;
    if (v !== null && typeof v === "object" && "result" in v) {
      return (v as ExcelJS.CellFormulaValue).result;
    }
    if (v !== null && typeof v === "object" && "text" in v) {
      // Rich text / hyperlink
      return (v as { text?: string }).text ?? "";
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
}
