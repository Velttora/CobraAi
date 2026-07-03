/**
 * Motor de mapeo de columnas para importaciones multi-ERP.
 *
 * En lugar de "quemar" el formato de un ERP específico, este módulo mapea
 * cualquier encabezado (SAP, Siigo, Odoo, Helisa, etc.) al esquema canónico
 * interno (`ImportRow`) combinando tres estrategias:
 *   1. Alias exactos (alta confianza).
 *   2. Conjuntos de palabras clave / frases por campo canónico.
 *   3. Coincidencia difusa por tokens (Levenshtein) para abreviaturas/typos.
 *
 * La asignación es voraz por puntaje y resuelve ambigüedades (p. ej. prefiere
 * "Importe adeudado" sobre "Importe sin impuestos" para el monto a cobrar).
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
  { internal: "currency",                   label: "Moneda",            required: false, description: "COP, USD, EUR… (COP por defecto)" },
  { internal: "due_date",                   label: "Vencimiento",       required: true,  description: "Fecha de vencimiento YYYY-MM-DD" },
  { internal: "invoice_date",               label: "Fecha Factura",     required: false, description: "Fecha de emisión de la factura YYYY-MM-DD" },
  { internal: "scheduled_collection_date",  label: "Fecha Cobro",       required: false, description: "Fecha programada de gestión YYYY-MM-DD" },
  { internal: "payment_terms_days",         label: "Plazo Días",        required: false, description: "Plazo pactado en días (ej. 30)" },
  { internal: "debtor_type",                label: "Tipo",              required: false, description: "empresa o persona" },
  { internal: "address_city",               label: "Ciudad",            required: false, description: "Ciudad del deudor" },
  { internal: "address_country",            label: "País",              required: false, description: "Código de país (ej. CO)" },
  { internal: "discount_percentage",        label: "Descuento Pronto Pago (%)", required: false, description: "Porcentaje de descuento por pronto pago (ej. 5 o 0.05)" },
  { internal: "discount_expiration_date",   label: "Fecha Límite Pronto Pago",  required: false, description: "Fecha límite para el descuento por pronto pago YYYY-MM-DD" },
];

/** Campos sin los cuales no se puede crear una deuda. */
export const REQUIRED_FIELDS = ["debtor_name", "amount", "due_date"] as const;

interface FieldMatcher {
  field: string;
  /** Alias normalizados de máxima confianza (match exacto). */
  aliases: string[];
  /** Palabras o frases que, presentes en el header, indican este campo. */
  keywords: string[];
  /** Palabras que reducen el puntaje (desambiguación). */
  negativeKeywords?: string[];
  /** Desempate cuando hay puntajes iguales (mayor gana). */
  preference?: number;
}

/**
 * Definición de matchers por campo. Los keywords son semillas extensibles:
 * al recibir exports reales de cada ERP se afinan sin cambiar la arquitectura.
 */
const FIELD_MATCHERS: FieldMatcher[] = [
  {
    field: "debtor_name",
    aliases: [
      "nombre",
      "debtor_name",
      "razon social",
      "cliente",
      "nombre cliente",
      "nombre del cliente",
      "tercero",
      "nombre tercero",
      "beneficiario",
      "nombre de la empresa a mostrar en la factura",
      "nombre de la empresa",
    ],
    keywords: [
      "razon social",
      "nombre cliente",
      "nombre tercero",
      "nombre deudor",
      "cliente",
      "tercero",
      "beneficiario",
      "deudor",
      "customer name",
      "customer",
      "partner",
      "nombre",
      "contribuyente",
    ],
    negativeKeywords: ["vendedor", "asesor", "usuario", "banco", "archivo"],
    preference: 5,
  },
  {
    field: "debtor_tax_id",
    aliases: [
      "nit",
      "cedula",
      "cedula/nit",
      "nit/cedula",
      "debtor_tax_id",
      "identificacion",
      "rut",
      "tax id",
      "vat",
    ],
    keywords: [
      "nit",
      "cedula",
      "identificacion",
      "rut",
      "ruc",
      "vat",
      "dni",
      "tributaria",
      "tax id",
      "documento identidad",
      "num identificacion",
    ],
    negativeKeywords: ["fecha"],
  },
  {
    field: "debtor_phone",
    aliases: ["telefono", "celular", "asociado/telefono", "asociado telefono"],
    keywords: [
      "telefono",
      "celular",
      "movil",
      "phone",
      "whatsapp",
      "contacto",
      "tel ",
    ],
  },
  {
    field: "debtor_email",
    aliases: [
      "correo",
      "correo electronico",
      "email",
      "asociado/correo",
      "asociado/email",
    ],
    keywords: ["correo", "email", "e mail", "mail"],
  },
  {
    field: "amount",
    aliases: [
      "monto",
      "amount",
      "valor",
      "saldo",
      "valor deuda",
      "importe adeudado",
      "saldo pendiente",
    ],
    keywords: [
      "saldo pendiente",
      "saldo a cobrar",
      "importe adeudado",
      "valor deuda",
      "saldo",
      "adeudado",
      "pendiente",
      "importe",
      "monto",
      "valor",
      "vlr",
      "deuda",
      "balance",
      "capital",
      "debe",
    ],
    negativeKeywords: [
      "sin impuestos",
      "base",
      "original",
      "pagado",
      "abono",
      "retencion",
      "iva",
      "descuento",
      "cuota",
      "anticipo",
    ],
    preference: 5,
  },
  {
    field: "currency",
    aliases: ["moneda", "currency", "divisa"],
    keywords: ["moneda", "currency", "divisa"],
  },
  {
    field: "due_date",
    aliases: [
      "vencimiento",
      "fecha vencimiento",
      "fecha de vencimiento",
      "vence",
      "due date",
      "due_date",
    ],
    keywords: [
      "fecha de vencimiento",
      "fecha vencimiento",
      "vencimiento",
      "fecha limite",
      "fecha de pago",
      "fecha pago",
      "due date",
      "vence",
      "vto",
      "vencto",
    ],
    preference: 5,
  },
  {
    field: "invoice_date",
    aliases: [
      "fecha factura",
      "fecha de factura",
      "fecha emision",
      "invoice_date",
    ],
    keywords: [
      "fecha de factura",
      "fecha factura",
      "fecha de la factura",
      "fecha emision",
      "fecha de emision",
      "fecha expedicion",
      "fecha de expedicion",
      "fecha documento",
      "invoice date",
    ],
  },
  {
    field: "scheduled_collection_date",
    aliases: ["fecha cobro", "fecha de cobro", "scheduled_collection_date"],
    keywords: [
      "fecha de cobro",
      "fecha cobro",
      "fecha de gestion",
      "fecha programada",
    ],
  },
  {
    field: "payment_terms_days",
    aliases: ["plazo dias", "plazo", "payment_terms_days"],
    keywords: ["dias plazo", "plazo dias", "plazo", "terminos de pago", "payment terms"],
    negativeKeywords: ["fecha"],
  },
  {
    field: "debtor_type",
    aliases: ["tipo", "tipo deudor", "debtor_type"],
    keywords: ["tipo deudor", "tipo de cliente", "tipo tercero", "tipo persona"],
  },
  {
    field: "address_city",
    aliases: ["ciudad", "address_city"],
    keywords: ["ciudad", "municipio", "poblacion", "city"],
  },
  {
    field: "address_country",
    aliases: ["pais", "address_country"],
    keywords: ["pais", "country"],
  },
  {
    field: "discount_percentage",
    aliases: [
      "porcentaje de descuento pronto pago",
      "porcentaje descuento pronto pago",
      "porcentaje de descuento",
      "descuento pronto pago",
      "porcentaje descuento",
      "descuento",
      "discount_percentage",
      "discount percentage",
    ],
    keywords: [
      "porcentaje de descuento",
      "descuento pronto pago",
      "descuento por pronto pago",
      "porcentaje descuento",
      "porcentaje de dcto",
      "pronto pago",
      "descuento",
      "dcto pronto pago",
      "discount percentage",
    ],
    negativeKeywords: ["fecha", "limite", "valor"],
    preference: 3,
  },
  {
    field: "discount_expiration_date",
    aliases: [
      "fecha limite de pago pronto pago",
      "fecha limite pronto pago",
      "fecha de pronto pago",
      "fecha pronto pago",
      "vencimiento pronto pago",
      "fecha limite descuento",
      "fecha descuento",
      "discount_expiration_date",
      "discount expiration date",
    ],
    keywords: [
      "fecha limite de pago pronto pago",
      "fecha limite pronto pago",
      "fecha de pronto pago",
      "fecha pronto pago",
      "limite pronto pago",
      "vencimiento pronto pago",
      "fecha limite descuento",
      "fecha descuento",
      "limite de pago",
      "pronto pago",
      "discount expiration date",
    ],
  },
  {
    field: "external_ref",
    aliases: [
      "referencia",
      "ref",
      "external_ref",
      "no factura",
      "numero factura",
      "# factura",
      "numero",
      "documento",
      "comprobante",
    ],
    keywords: [
      "numero factura",
      "num factura",
      "no factura",
      "nro factura",
      "factura",
      "comprobante",
      "consecutivo",
      "documento",
      "referencia",
      "invoice",
      "numero",
    ],
    negativeKeywords: ["fecha", "estado", "tipo"],
  },
];

const MIN_SCORE = 45;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // elimina tildes
    .replace(/[^a-z0-9 _/]/g, " ") // caracteres especiales → espacio
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/** Puntaje de qué tan bien un header corresponde a un campo (0 = no aplica). */
function scoreHeader(normalizedHeader: string, matcher: FieldMatcher): number {
  if (!normalizedHeader) return 0;

  // 1. Alias exacto
  if (matcher.aliases.some((a) => normalize(a) === normalizedHeader)) {
    return 100 + (matcher.preference ?? 0);
  }

  let best = 0;

  // 2. Frases / palabras clave por substring
  for (const kw of matcher.keywords) {
    const nkw = normalize(kw);
    if (!nkw) continue;
    if (normalizedHeader === nkw) {
      best = Math.max(best, 80 + nkw.length);
    } else if (normalizedHeader.includes(nkw)) {
      // Frases más largas → match más fuerte
      best = Math.max(best, 50 + Math.min(nkw.length, 25));
    }
  }

  // 3. Fuzzy por token (solo si no hubo substring claro)
  if (best === 0) {
    const tokens = normalizedHeader.split(" ");
    for (const kw of matcher.keywords) {
      const nkw = normalize(kw);
      if (nkw.includes(" ") || nkw.length < 4) continue; // solo palabras simples
      for (const t of tokens) {
        if (t.length < 4) continue;
        if (levenshtein(t, nkw) <= 1) {
          best = Math.max(best, 46);
        }
      }
    }
  }

  // 4. Penalización por palabras que desambiguan
  if (best > 0 && matcher.negativeKeywords) {
    for (const nk of matcher.negativeKeywords) {
      if (normalizedHeader.includes(normalize(nk))) {
        best -= 40;
      }
    }
  }

  return best > 0 ? best + (matcher.preference ?? 0) : 0;
}

export interface ColumnMapping {
  /** índice de columna (0-based) → campo interno */
  byIndex: Map<number, string>;
  /** columnas que no se reconocieron */
  unmapped: { index: number; header: string }[];
  /** campos requeridos que no se encontraron */
  missingRequired: string[];
}

/**
 * Construye el mapeo columna→campo para un arreglo de headers.
 * Asignación voraz por puntaje: cada header y cada campo se usan una sola vez,
 * priorizando los matches más fuertes (resuelve gross vs net, etc.).
 */
export function buildColumnMapping(headers: string[]): ColumnMapping {
  type Triple = { index: number; field: string; score: number };
  const candidates: Triple[] = [];

  headers.forEach((rawHeader, index) => {
    const norm = normalize(rawHeader ?? "");
    if (!norm) return;
    for (const matcher of FIELD_MATCHERS) {
      const score = scoreHeader(norm, matcher);
      if (score >= MIN_SCORE) {
        candidates.push({ index, field: matcher.field, score });
      }
    }
  });

  candidates.sort((a, b) => b.score - a.score);

  const byIndex = new Map<number, string>();
  const usedFields = new Set<string>();
  for (const c of candidates) {
    if (byIndex.has(c.index) || usedFields.has(c.field)) continue;
    byIndex.set(c.index, c.field);
    usedFields.add(c.field);
  }

  const unmapped: { index: number; header: string }[] = [];
  headers.forEach((rawHeader, index) => {
    if (!byIndex.has(index) && (rawHeader ?? "").trim().length > 0) {
      unmapped.push({ index, header: rawHeader });
    }
  });

  const missingRequired = REQUIRED_FIELDS.filter((f) => !usedFields.has(f));

  return { byIndex, unmapped, missingRequired };
}

/** Convierte un header al nombre interno de columna, o null si no mapea. */
export function matchHeader(raw: string): string | null {
  const norm = normalize(raw ?? "");
  if (!norm) return null;
  let bestField: string | null = null;
  let bestScore = 0;
  for (const matcher of FIELD_MATCHERS) {
    const score = scoreHeader(norm, matcher);
    if (score > bestScore && score >= MIN_SCORE) {
      bestScore = score;
      bestField = matcher.field;
    }
  }
  return bestField;
}

/** Genera la clave metadata_ para una columna no reconocida. */
export function metadataKeyFor(header: string): string {
  const norm = normalize(header).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `metadata_${norm || "extra"}`;
}
