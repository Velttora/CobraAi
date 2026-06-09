/**
 * Normalizadores de valores robustos por locale, compartidos por los parsers
 * de CSV y XLSX (y a futuro PDF). El objetivo es aceptar los formatos que
 * exportan distintos ERPs sin "quemar" un único estilo.
 */

/**
 * Convierte un valor de monto a número.
 * Soporta:
 *   - Separadores LatAm/EU: "1.234.567,89"
 *   - Separadores US: "1,234,567.89"
 *   - Símbolos de moneda y espacios: "$ 1.234.567"
 *   - Negativos con paréntesis "(1.234)" o sufijo "1.234-"
 * Devuelve NaN si no se puede interpretar.
 */
export function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (raw == null) return NaN;

  let s = String(raw).trim();
  if (!s) return NaN;

  // Negativos
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-\s*$/, "");
  }
  if (/^\s*-/.test(s)) {
    negative = true;
  }

  // Quita todo salvo dígitos, separadores y signo
  s = s.replace(/[^0-9.,-]/g, "");
  if (!s) return NaN;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // El último separador que aparece es el decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // formato LatAm/EU: "." miles, "," decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // formato US: "," miles, "." decimal
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Solo coma: decimal si hay 1-2 dígitos tras la última coma, si no, miles
    const parts = s.split(",");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && last.length > 0 && last.length <= 2) {
      s = `${parts[0]}.${last}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    // Solo punto: decimal si hay 1-2 dígitos tras el último punto, si no, miles
    const parts = s.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length > 2 || !(last.length > 0 && last.length <= 2)) {
      s = s.replace(/\./g, "");
    }
  }

  s = s.replace(/-/g, "");
  const n = Number(s);
  if (Number.isNaN(n)) return NaN;
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1,
  feb: 2,
  mar: 3,
  abr: 4, apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8, aug: 8,
  sep: 9, sept: 9,
  oct: 10,
  nov: 11,
  dic: 12, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > 2200) return false;
  return true;
}

/**
 * Convierte un valor de fecha a "YYYY-MM-DD".
 * Soporta: Date de Excel, serial de Excel, ISO, dd/mm/yyyy, dd-mm-yyyy,
 * yyyymmdd, dd/mm/yy y "dd-mmm-yyyy" con mes en texto.
 * Devuelve "" si no se puede interpretar.
 */
export function parseDate(raw: unknown): string {
  if (raw == null) return "";

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return "";
    return `${raw.getUTCFullYear()}-${pad(raw.getUTCMonth() + 1)}-${pad(raw.getUTCDate())}`;
  }

  // Serial de Excel (número de días desde 1899-12-30)
  if (typeof raw === "number" && raw > 0 && raw < 100000) {
    const epoch = Date.UTC(1899, 11, 30);
    const dt = new Date(epoch + Math.round(raw) * 86400000);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  const s = String(raw).trim();
  if (!s) return "";

  // ISO con tiempo: 2026-05-30T00:00:00Z
  const isoT = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/);
  if (isoT) {
    return `${isoT[1]}-${isoT[2]}-${isoT[3]}`;
  }

  // yyyymmdd
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const y = Number(compact[1]);
    const m = Number(compact[2]);
    const d = Number(compact[3]);
    if (isValidYmd(y, m, d)) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  // dd/mm/yyyy o dd-mm-yyyy o dd.mm.yyyy (y variantes con yy)
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let y = Number(dmy[3]);
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    // Asume dd/mm (LatAm); si el primero >12 es claramente día
    let day = a;
    let month = b;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      // formato mm/dd
      day = b;
      month = a;
    }
    if (isValidYmd(y, month, day)) return `${y}-${pad(month)}-${pad(day)}`;
  }

  // yyyy/mm/dd
  const ymd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (isValidYmd(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`;
  }

  // dd-mmm-yyyy (mes en texto)
  const textual = s.match(/^(\d{1,2})[ \-/]([a-zA-Z]{3,4})[ \-/.](\d{2,4})$/);
  if (textual) {
    const d = Number(textual[1]);
    const mk = textual[2]!.toLowerCase().slice(0, 4);
    const month = MONTHS[mk] ?? MONTHS[mk.slice(0, 3)];
    let y = Number(textual[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (month && isValidYmd(y, month, d)) return `${y}-${pad(month)}-${pad(d)}`;
  }

  return "";
}

/** Normaliza el código de moneda a ISO en mayúsculas; COP por defecto. */
export function normalizeCurrency(raw: unknown): string {
  const s = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (!s) return "COP";
  const map: Record<string, string> = {
    PESOS: "COP",
    PESO: "COP",
    "$": "COP",
    DOLAR: "USD",
    DOLARES: "USD",
    DOLLAR: "USD",
    EURO: "EUR",
    EUROS: "EUR",
  };
  if (map[s]) return map[s];
  // Si ya es un código ISO de 3 letras, úsalo
  if (/^[A-Z]{3}$/.test(s)) return s;
  return "COP";
}
