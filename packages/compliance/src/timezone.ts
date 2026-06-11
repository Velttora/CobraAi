/** Zona horaria IANA por país (LATAM). */
export const COUNTRY_TIMEZONES: Record<string, string> = {
  CO: "America/Bogota",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  DEFAULT: "America/Bogota"
};

export function timezoneForCountry(countryCode: string): string {
  return COUNTRY_TIMEZONES[countryCode] ?? COUNTRY_TIMEZONES.DEFAULT!;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
};

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

/** Partes de fecha/hora en la zona horaria del deudor (reloj local 24h). */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  }).formatToParts(date);

  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  let hour = Number(pick("hour"));
  if (hour === 24) hour = 0;

  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour,
    minute: Number(pick("minute")),
    dayOfWeek: WEEKDAY[pick("weekday")] ?? 0
  };
}

/** Convierte una hora civil local (24h) a instante UTC. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 4; i++) {
    const p = getZonedParts(new Date(utc), timeZone);
    const desired = Date.UTC(year, month - 1, day, hour, 0, 0);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    const delta = desired - actual;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

/** Suma días al calendario civil en la zona horaria (evita saltos DST raros). */
export function addLocalDays(
  parts: ZonedParts,
  days: number,
  timeZone: string
): ZonedParts {
  const anchor = zonedTimeToUtc(parts.year, parts.month, parts.day, 12, timeZone);
  const next = new Date(anchor.getTime() + days * 86_400_000);
  return getZonedParts(next, timeZone);
}
