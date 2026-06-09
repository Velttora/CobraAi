import { Injectable } from "@nestjs/common";
import Papa from "papaparse";
import {
  buildColumnMapping,
  metadataKeyFor,
  REQUIRED_FIELDS,
} from "./column-map";
import { buildImportRow } from "./row-builder";

export type ImportRow = {
  external_ref?: string;
  debtor_name: string;
  debtor_tax_id?: string;
  debtor_phone?: string;
  debtor_email?: string;
  amount: number;
  currency: string;
  due_date: string;
  scheduled_collection_date?: string;
  payment_terms_days?: number;
  invoice_date?: string;
  debtor_type?: string;
  address_city?: string;
  address_country?: string;
  metadata?: Record<string, string>;
};

/** Resultado de un parser: filas canónicas + avisos no fatales. */
export type ParseResult = {
  rows: ImportRow[];
  warnings: string[];
};

@Injectable()
export class CsvParserService {
  /**
   * Parsea CSV de cualquier ERP: tolera líneas de título antes del header,
   * detecta la fila de encabezados y mapea columnas al esquema canónico.
   */
  parseCsv(buffer: Buffer, encoding: BufferEncoding = "utf-8"): ParseResult {
    const text = buffer.toString(encoding);
    const parsed = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: "greedy",
    });

    const grid = (parsed.data ?? []).filter(
      (row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim())
    );
    if (grid.length === 0) {
      throw new Error("El archivo CSV no tiene filas con datos");
    }

    const headerIndex = this.detectHeaderRow(grid);
    const headers = (grid[headerIndex] ?? []).map((h) => String(h ?? "").trim());
    const mapping = buildColumnMapping(headers);

    if (mapping.missingRequired.length > 0) {
      const detected = headers.filter((h) => h.length > 0);
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
    for (let r = headerIndex + 1; r < grid.length; r++) {
      const mapped = this.mapRow(grid[r] ?? [], headers, mapping);
      if (mapped) rows.push(mapped);
    }

    return { rows, warnings };
  }

  private detectHeaderRow(grid: string[][]): number {
    const maxScan = Math.min(15, grid.length);
    let bestIndex = 0;
    let bestScore = -1;

    for (let r = 0; r < maxScan; r++) {
      const headers = (grid[r] ?? []).map((h) => String(h ?? "").trim());
      if (headers.every((h) => h.length === 0)) continue;
      const mapping = buildColumnMapping(headers);
      const matched = mapping.byIndex.size;
      const requiredHit = REQUIRED_FIELDS.filter((f) =>
        [...mapping.byIndex.values()].includes(f)
      ).length;
      const score = matched + requiredHit * 3;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = r;
      }
    }

    return bestIndex;
  }

  private mapRow(
    cells: string[],
    headers: string[],
    mapping: ReturnType<typeof buildColumnMapping>
  ): ImportRow | null {
    const fields: Record<string, unknown> = {};
    const metadata: Record<string, string> = {};

    for (let i = 0; i < headers.length; i++) {
      const value = String(cells[i] ?? "").trim();
      const field = mapping.byIndex.get(i);
      if (field) {
        fields[field] = value;
      } else if (headers[i] && value) {
        metadata[metadataKeyFor(headers[i]!).replace(/^metadata_/, "")] = value;
      }
    }

    return buildImportRow(fields, metadata);
  }
}
