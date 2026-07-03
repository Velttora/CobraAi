import { type ImportRow } from "./csv-parser.service";
import {
  normalizeCurrency,
  parseAmount,
  parseDate,
  parsePercentage,
} from "./value-parsers";

function text(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return parseDate(v);
  return String(v).trim();
}

/**
 * Construye un ImportRow canónico desde los valores ya mapeados por campo.
 * Devuelve null para filas que no pueden formar una deuda (totales, vacías o
 * facturas con saldo 0) para no abortar toda la importación.
 */
export function buildImportRow(
  fields: Record<string, unknown>,
  metadata: Record<string, string> = {}
): ImportRow | null {
  const debtorName = text(fields["debtor_name"]);
  const amount = parseAmount(fields["amount"]);
  const dueDate = parseDate(fields["due_date"]);

  if (!debtorName) return null;
  if (Number.isNaN(amount) || amount <= 0) return null;
  if (!dueDate) return null;

  const termsRaw = text(fields["payment_terms_days"]);
  const terms = termsRaw ? Number(termsRaw.replace(/[^0-9]/g, "")) : undefined;

  // Descuento por pronto pago: no tiene columna propia en la deuda, así que se
  // guarda en `metadata` para exponerlo luego como variable de plantilla.
  const discountPct = parsePercentage(fields["discount_percentage"]);
  const discountDate = parseDate(fields["discount_expiration_date"]);
  const discountMetadata: Record<string, string> = {};
  if (Number.isFinite(discountPct) && discountPct > 0) {
    discountMetadata.discount_percentage = String(discountPct);
  }
  if (discountDate) {
    discountMetadata.discount_expiration_date = discountDate;
  }
  const mergedMetadata = { ...metadata, ...discountMetadata };

  return {
    external_ref: text(fields["external_ref"]) || undefined,
    debtor_name: debtorName,
    debtor_tax_id: text(fields["debtor_tax_id"]) || undefined,
    debtor_phone: text(fields["debtor_phone"]) || undefined,
    debtor_email: text(fields["debtor_email"]) || undefined,
    amount,
    currency: normalizeCurrency(fields["currency"]),
    due_date: dueDate,
    scheduled_collection_date:
      parseDate(fields["scheduled_collection_date"]) || undefined,
    payment_terms_days:
      terms && Number.isFinite(terms) && terms > 0 ? terms : undefined,
    invoice_date: parseDate(fields["invoice_date"]) || undefined,
    debtor_type: text(fields["debtor_type"]) || undefined,
    address_city: text(fields["address_city"]) || undefined,
    address_country: text(fields["address_country"]) || undefined,
    metadata:
      Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
  };
}
