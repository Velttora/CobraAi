/**
 * Mapeo bidireccional entre columnas técnicas (internas) y etiquetas
 * en español que se usan en los templates descargables y documentación.
 *
 * El parser normaliza cualquier header recibido (español o inglés,
 * mayúsculas, espacios extras) al nombre interno antes de procesar.
 */

export interface ColumnDef {
  /** Nombre interno usado por el sistema */
  internal: string;
  /** Etiqueta en español para templates y UI */
  label: string;
  required: boolean;
  description: string;
}

export const COLUMN_DEFS: ColumnDef[] = [
  { internal: "external_ref",               label: "Referencia",        required: false, description: "ID de tu sistema (factura, contrato…)" },
  { internal: "debtor_name",                label: "Nombre",            required: true,  description: "Nombre o razón social del deudor" },
  { internal: "debtor_tax_id",              label: "NIT / Cédula",      required: false, description: "NIT o número de cédula" },
  { internal: "debtor_phone",               label: "Teléfono",          required: false, description: "Número de contacto (ej. 3001234567)" },
  { internal: "debtor_email",               label: "Correo",            required: false, description: "Correo electrónico del deudor" },
  { internal: "amount",                     label: "Monto",             required: true,  description: "Valor de la deuda sin separadores (ej. 1500000)" },
  { internal: "currency",                   label: "Moneda",            required: true,  description: "COP, USD, EUR…" },
  { internal: "due_date",                   label: "Vencimiento",       required: true,  description: "Fecha de vencimiento YYYY-MM-DD" },
  { internal: "invoice_date",               label: "Fecha Factura",     required: false, description: "Fecha de emisión de la factura YYYY-MM-DD" },
  { internal: "scheduled_collection_date",  label: "Fecha Cobro",       required: false, description: "Fecha programada de gestión YYYY-MM-DD" },
  { internal: "payment_terms_days",         label: "Plazo Días",        required: false, description: "Plazo pactado en días (ej. 30)" },
  { internal: "debtor_type",                label: "Tipo",              required: false, description: "empresa o persona" },
  { internal: "address_city",               label: "Ciudad",            required: false, description: "Ciudad del deudor" },
  { internal: "address_country",            label: "País",              required: false, description: "Código de país (ej. CO)" },
];

/** Construye un mapa lowercase(alias) → internal para normalizar headers. */
function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const col of COLUMN_DEFS) {
    map.set(col.internal.toLowerCase(), col.internal);
    map.set(normalize(col.label), col.internal);
  }
  // Alias extra por variaciones comunes
  const extras: Record<string, string> = {
    "nit":                          "debtor_tax_id",
    "cedula":                       "debtor_tax_id",
    "cedula/nit":                   "debtor_tax_id",
    "nit/cedula":                   "debtor_tax_id",
    "email":                        "debtor_email",
    "correo electronico":           "debtor_email",
    "telefono":                     "debtor_phone",
    "celular":                      "debtor_phone",
    "valor":                        "amount",
    "valor deuda":                  "amount",
    "saldo":                        "amount",
    "fecha vencimiento":            "due_date",
    "fecha de vencimiento":         "due_date",
    "vence":                        "due_date",
    "fecha factura":                "invoice_date",
    "fecha de factura":             "invoice_date",
    "fecha emision":                "invoice_date",
    "fecha cobro":                  "scheduled_collection_date",
    "fecha de cobro":               "scheduled_collection_date",
    "plazo":                        "payment_terms_days",
    "dias plazo":                   "payment_terms_days",
    "tipo deudor":                  "debtor_type",
    "ciudad":                       "address_city",
    "pais":                         "address_country",
    "referencia":                   "external_ref",
    "ref":                          "external_ref",
    "no factura":                   "external_ref",
    "numero factura":               "external_ref",
    "# factura":                    "external_ref",
  };
  for (const [alias, internal] of Object.entries(extras)) {
    map.set(normalize(alias), internal);
  }
  return map;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")                    // separa letras de tildes
    .replace(/[̀-ͯ]/g, "")     // elimina tildes
    .replace(/[^a-z0-9 _/]/g, "")       // quita caracteres especiales
    .trim()
    .replace(/\s+/g, " ");              // normaliza espacios
}

const ALIAS_MAP = buildAliasMap();

/**
 * Convierte cualquier header (español, inglés, con tildes, espacios) al
 * nombre interno de la columna. Devuelve el propio string si no hay match
 * (para soportar columnas metadata_*).
 */
export function normalizeHeader(raw: string): string {
  if (!raw) return raw;
  const key = normalize(raw);
  return ALIAS_MAP.get(key) ?? raw.trim().toLowerCase();
}
