import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

const headerAliases = new Map<string, string>([
  ["documento", "documentId"],
  ["documentid", "documentId"],
  ["nit", "documentId"],
  ["cedula", "documentId"],
  ["cédula", "documentId"],
  ["cliente", "name"],
  ["nombre", "name"],
  ["name", "name"],
  ["telefono", "phone"],
  ["teléfono", "phone"],
  ["celular", "phone"],
  ["whatsapp", "phone"],
  ["phone", "phone"],
  ["correo", "email"],
  ["email", "email"],
  ["vendedor", "sellerName"],
  ["sellernombre", "sellerName"],
  ["sellername", "sellerName"],
  ["correovendedor", "sellerEmail"],
  ["selleremail", "sellerEmail"],
  ["factura", "invoiceNumber"],
  ["numerofactura", "invoiceNumber"],
  ["númerofactura", "invoiceNumber"],
  ["number", "invoiceNumber"],
  ["invoice", "invoiceNumber"],
  ["invoiceexternalid", "invoiceExternalId"],
  ["idfactura", "invoiceExternalId"],
  ["montofactura", "amount"],
  ["monto", "amount"],
  ["valor", "amount"],
  ["saldo", "amount"],
  ["amount", "amount"],
  ["moneda", "currency"],
  ["currency", "currency"],
  ["fechafactura", "issueDate"],
  ["fechaemision", "issueDate"],
  ["fechaemisión", "issueDate"],
  ["issuedate", "issueDate"],
  ["fechavencimiento", "dueDate"],
  ["vencimiento", "dueDate"],
  ["duedate", "dueDate"],
  ["estado", "status"],
  ["status", "status"],
  ["diascredito", "creditDays"],
  ["diasmora", "daysPastDue"],
  ["promesapago", "paymentPromiseDate"],
  ["canalpreferido", "preferredChannel"],
  ["ultimocontacto", "lastContactAt"],
  ["riesgo", "riskLabel"],
  ["externalid", "externalId"],
  ["idsistema", "externalId"],
  ["sistema", "sourceSystem"],
  ["sourcesystem", "sourceSystem"]
]);

export function canonicalizeHeader(header: string): string {
  const compact = header
    .trim()
    .toLowerCase()
    .replaceAll(/\s|_|-/g, "");

  return headerAliases.get(compact) ?? header.trim();
}

export function readString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function normalizePhone(value: unknown, defaultCountry: CountryCode = "CO"): string | undefined {
  const rawPhone = readString(value);
  if (!rawPhone) {
    return undefined;
  }

  const phone = parsePhoneNumberFromString(rawPhone, defaultCountry);
  return phone?.isValid() ? phone.number : rawPhone.replaceAll(/\s/g, "");
}

export function normalizeAmount(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const rawAmount = readString(value);
  if (!rawAmount) {
    return undefined;
  }

  const normalized = rawAmount
    .replaceAll(/\s/g, "")
    .replaceAll(".", "")
    .replace(",", ".");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : undefined;
}

export function normalizeDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    // Excel serial date where 25569 is 1970-01-01.
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86_400_000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const rawDate = readString(value);
  if (!rawDate) {
    return undefined;
  }

  const isoDate = new Date(rawDate);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate;
  }

  const match = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) {
    return undefined;
  }

  const day = match[1];
  const month = match[2];
  const year = match[3];
  if (!day || !month || !year) {
    return undefined;
  }

  const fullYear = Number(year.length === 2 ? `20${year}` : year);
  const parsedDate = new Date(Date.UTC(fullYear, Number(month) - 1, Number(day)));

  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}
