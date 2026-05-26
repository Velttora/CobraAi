import { Injectable } from "@nestjs/common";
import Papa from "papaparse";
import { normalizeHeader } from "./column-map";

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

@Injectable()
export class CsvParserService {
  parseCsv(buffer: Buffer, encoding: BufferEncoding = "utf-8"): ImportRow[] {
    const text = buffer.toString(encoding);
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => normalizeHeader(h)
    });

    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0]?.message ?? "CSV inválido");
    }

    return parsed.data.map((row) => this.mapImportRow(row));
  }

  mapImportRow(row: Record<string, string>): ImportRow {
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith("metadata_")) {
        metadata[key.replace(/^metadata_/, "")] = value;
      }
    }

    const amount = Number(row.amount);
    if (!row.debtor_name || !row.amount || !row.currency || !row.due_date) {
      throw new Error("Fila incompleta: debtor_name, amount, currency, due_date requeridos");
    }
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error("amount debe ser positivo");
    }

    const scheduled = row.scheduled_collection_date?.trim();
    const invoice = row.invoice_date?.trim();
    const termsRaw = row.payment_terms_days?.trim();

    if (scheduled && invoice && new Date(scheduled) < new Date(row.due_date)) {
      // scheduled puede ser posterior a due_date; solo validar formato
    }
    if (invoice && new Date(invoice) > new Date(row.due_date)) {
      throw new Error("invoice_date no puede ser posterior a due_date");
    }

    let paymentTermsDays: number | undefined;
    if (termsRaw) {
      const terms = Number(termsRaw);
      if (!Number.isInteger(terms) || terms < 1 || terms > 720) {
        throw new Error("payment_terms_days debe ser entero entre 1 y 720");
      }
      paymentTermsDays = terms;
    }

    return {
      external_ref: row.external_ref,
      debtor_name: row.debtor_name,
      debtor_tax_id: row.debtor_tax_id,
      debtor_phone: row.debtor_phone,
      debtor_email: row.debtor_email,
      amount,
      currency: row.currency.toUpperCase(),
      due_date: row.due_date,
      scheduled_collection_date: scheduled || undefined,
      payment_terms_days: paymentTermsDays,
      invoice_date: invoice || undefined,
      debtor_type: row.debtor_type,
      address_city: row.address_city,
      address_country: row.address_country,
      metadata
    };
  }
}
