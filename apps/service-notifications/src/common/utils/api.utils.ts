import type { ApiMeta, ApiSuccessResponse } from "@cobrai/types";
import { randomUUID } from "node:crypto";

export function successResponse<T>(
  data: T,
  requestId?: string
): ApiSuccessResponse<T> {
  const meta: ApiMeta = {
    request_id: requestId ?? randomUUID(),
    timestamp: new Date().toISOString()
  };
  return { success: true, data, meta };
}

export function renderTemplate(
  content: string,
  variables: Record<string, string>
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

export function truncateSms(body: string, max = 160): string {
  if (body.length <= max) return body;
  return `${body.slice(0, max - 1)}…`;
}

export function parseMessagePayload(content: string): {
  text: string;
  provider_message_id?: string;
} {
  try {
    const parsed = JSON.parse(content) as {
      text?: string;
      provider_message_id?: string;
    };
    if (parsed.text !== undefined) return { text: parsed.text, provider_message_id: parsed.provider_message_id };
  } catch {
    /* plain text */
  }
  return { text: content };
}

export function buildMessageContent(
  text: string,
  providerMessageId?: string
): string {
  return JSON.stringify({
    text,
    ...(providerMessageId ? { provider_message_id: providerMessageId } : {})
  });
}

export function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function phonesFromDebtor(phones: unknown): string[] {
  if (!Array.isArray(phones)) return [];
  return phones.filter((p): p is string => typeof p === "string" && p.length > 0);
}

export function countryFromAddress(address: unknown): string {
  if (!address || typeof address !== "object") return "CO";
  const country = (address as { country?: string }).country;
  return country?.toUpperCase().slice(0, 2) ?? "CO";
}

// ─── Speech helpers (TTS español) ───────────────────────────────────────────

const _MESES = ["enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre"];
const _UNIDADES = ["","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve",
  "diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho",
  "diecinueve","veinte","veintiuno","veintidós","veintitrés","veinticuatro","veinticinco",
  "veintiséis","veintisiete","veintiocho","veintinueve","treinta","treinta y uno"];
const _DECENAS = ["","","veinte","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"];
const _CENTENAS = ["","ciento","doscientos","trescientos","cuatrocientos","quinientos",
  "seiscientos","setecientos","ochocientos","novecientos"];

function _cientos(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100); const r = n % 100;
  const sc = c > 0 ? (_CENTENAS[c] ?? "") : "";
  if (r === 0) return sc;
  if (r < 20) return `${sc}${sc ? " " : ""}${_UNIDADES[r] ?? ""}`;
  const d = Math.floor(r / 10); const u = r % 10;
  return `${sc}${sc ? " " : ""}${_DECENAS[d] ?? ""}${u > 0 ? ` y ${_UNIDADES[u] ?? ""}` : ""}`;
}

export function montoEspanol(raw: string | number): string {
  const n = Math.round(Number(raw));
  if (isNaN(n)) return String(raw);
  if (n === 0) return "cero pesos colombianos";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1_000);
  const resto = n % 1_000;
  const parts: string[] = [];
  if (millones > 0) parts.push(millones === 1 ? "un millón" : `${_cientos(millones)} millones`);
  if (miles > 0) parts.push(miles === 1 ? "mil" : `${_cientos(miles)} mil`);
  if (resto > 0) parts.push(_cientos(resto));
  return `${parts.join(" ")} pesos colombianos`;
}

export function fechaEspanol(raw: string | Date | undefined): string {
  if (!raw) return "";
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (isNaN(d.getTime())) return String(raw);
  const dia = _UNIDADES[d.getUTCDate()] ?? String(d.getUTCDate());
  const mes = _MESES[d.getUTCMonth()] ?? "";
  const y = d.getUTCFullYear();
  const miles = Math.floor(y / 1000);
  const milesNombres = ["","mil","dos mil","tres mil"];
  const r = y % 1000;
  const anParts: string[] = [];
  if (miles > 0) anParts.push(milesNombres[miles] ?? `${miles} mil`);
  const c = Math.floor(r / 100); const rv = r % 100;
  if (c > 0) anParts.push(rv === 0 && c === 1 ? "cien" : (_CENTENAS[c] ?? ""));
  if (rv > 0 && rv < 30) anParts.push(_UNIDADES[rv] ?? "");
  else if (rv >= 30) { const dv = Math.floor(rv/10); const uv = rv%10; anParts.push(uv > 0 ? `${_DECENAS[dv]} y ${_UNIDADES[uv]}` : (_DECENAS[dv] ?? "")); }
  return `${dia} de ${mes} de ${anParts.filter(Boolean).join(" ")}`;
}
