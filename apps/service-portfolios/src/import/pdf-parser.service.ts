import { Injectable } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
import { type ImportRow } from "./csv-parser.service";

/**
 * Parsea el formato "ANALISIS DE VENCIMIENTOS POR EDADES" generado por
 * el sistema UNO VER 8.5 (UFCC2021).
 *
 * pdf-parse v2 extrae el texto con estas características:
 *   - Cabecera de cliente: una sola línea con NIT + nombre + "Tel:" + "Ciud:",
 *     a veces duplicada con \t (dos clientes concatenados) — se parte por \t.
 *   - Líneas de documento: "FE-018788-00 20260514 20260612 0 VENDOR 30 amt ..."
 *     Columnas de monto (COP): CORRIENTE | 001-030 | 031-060 | 061-090 | +090
 *   - Notas de crédito: prefijo NO- o montos con sufijo "–" → descartar
 *   - Líneas de totales / separadores: ignorar
 */
@Injectable()
export class PdfParserService {
  private static readonly SKIP_CONTAINS = [
    "Total Cliente",
    "Total General",
    "Rotacion:",
    "____",
    "ANALISIS DE VENCIMIENTO",
    "UFCC2021",
    "UNO - VER",
    "A LA FECHA",
    "DETALLADO",
    "Empresa :",
    "C.O.    :",
    "C.O. :",
    "Cuenta  :",
    "Cuenta :",
    "Orden :",
    "NOMBRE Y/O RAZON",
    "FEC_DCTO",
    "CORRIENTE",
    "---",
  ];

  // NIT (6-15 dígitos) + nombre (incluye dirección) + Tel + Ciud
  private static readonly CLIENT_RE =
    /^(\d{6,15})\s+(.+?)\s+Tel:\s*(\S+)\s+Ciud:\s*(\S+)/;

  // Prefijos de dirección colombianos para limpiar el nombre capturado
  private static readonly ADDR_RE =
    /\s+(?:CR|CL|AV|KR|DG|KM|MZ|BL|LT|CS|TV|AP|URB|BRR|GJ)\s+\d+.*$/i;

  // Línea de documento: DOC FEC_DCTO FEC_VCTO DIAS VENDEDOR PLAZO C0 C1 C2 C3 C4
  private static readonly DOC_RE =
    /^([A-Z]{2}-[\w-]+)\s+(\d{8})\s+(\d{8})\s+\d+\s+\S+\s+\d+\s+([\d,]+)(-?)\s+([\d,]+)(-?)\s+([\d,]+)(-?)\s+([\d,]+)(-?)\s+([\d,]+)(-?)/;

  async parse(
    buffer: Buffer,
    defaults: { email?: string; phone?: string; name?: string } = {}
  ): Promise<ImportRow[]> {
    const parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();
    return this.parseText(text, defaults);
  }

  isUno85Format(text: string): boolean {
    return text.includes("UFCC2021") && text.includes("ANALISIS DE VENCIMIENTO");
  }

  private parseText(
    text: string,
    defaults: { email?: string; phone?: string; name?: string }
  ): ImportRow[] {
    const rows: ImportRow[] = [];
    let currentNit = "";
    let currentName = defaults.name ?? "";
    let currentPhone = defaults.phone;
    let currentCity: string | undefined;

    // Flatten: split on \n then on \t so the duplicate client header becomes two sub-lines
    const lines: string[] = [];
    for (const raw of text.split("\n")) {
      for (const sub of raw.split("\t")) {
        lines.push(sub.trimEnd());
      }
    }

    const seen = new Set<string>();

    for (const line of lines) {
      if (this.shouldSkip(line)) continue;

      // ── Client header ───────────────────────────────────────────────────
      const clientMatch = PdfParserService.CLIENT_RE.exec(line);
      if (clientMatch) {
        const key = clientMatch[1]!.trim();
        if (seen.has(key)) continue; // duplicate (second occurrence)
        seen.add(key);

        currentNit = key;
        currentName = clientMatch[2]!.trim()
          .replace(PdfParserService.ADDR_RE, "")
          .trim();
        currentPhone = clientMatch[3]!.trim().replace(/\s/g, "");
        currentCity = clientMatch[4]!.trim();
        continue;
      }

      // ── Document line ───────────────────────────────────────────────────
      const docMatch = PdfParserService.DOC_RE.exec(line.trimStart());
      if (!docMatch) continue;

      const docRef = docMatch[1]!;

      // Skip credit notes (NO- prefix or any bucket with negative suffix)
      const hasNegative = [
        docMatch[5], docMatch[7], docMatch[9], docMatch[11], docMatch[13]
      ].some((s) => s === "-");
      if (docRef.startsWith("NO-") || hasNegative) continue;

      const buckets = [
        this.parseAmount(docMatch[4]!),  // CORRIENTE
        this.parseAmount(docMatch[6]!),  // 001-030
        this.parseAmount(docMatch[8]!),  // 031-060
        this.parseAmount(docMatch[10]!), // 061-090
        this.parseAmount(docMatch[12]!), // +090
      ];
      const amount = buckets.reduce((a, b) => a + b, 0);
      if (amount <= 0) continue;

      const invoiceDate = this.parseDate(docMatch[2]!);
      const dueDate = this.parseDate(docMatch[3]!);

      rows.push({
        external_ref: docRef,
        debtor_name: currentName,
        debtor_tax_id: currentNit || undefined,
        debtor_phone: currentPhone || defaults.phone,
        debtor_email: defaults.email,
        address_city: currentCity,
        amount,
        currency: "COP",
        due_date: dueDate,
        invoice_date: invoiceDate,
      });
    }

    return rows;
  }

  private shouldSkip(line: string): boolean {
    if (line.trim().length === 0) return true;
    if (line.startsWith("+") || line.startsWith("|")) return true;
    for (const s of PdfParserService.SKIP_CONTAINS) {
      if (line.includes(s)) return true;
    }
    return false;
  }

  private parseAmount(s: string): number {
    return Number(s.replace(/,/g, "")) || 0;
  }

  private parseDate(yyyymmdd: string): string {
    return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  }
}
