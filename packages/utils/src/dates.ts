/** Zona horaria de referencia del negocio (Colombia / LATAM). */
export const APP_TIMEZONE = "America/Bogota";

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** Partes de fecha/hora de un instante en la zona horaria indicada. */
export function getZonedParts(
  date: Date,
  timeZone: string = APP_TIMEZONE
): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const pick = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour,
    minute: pick("minute")
  };
}

/**
 * Instante UTC que corresponde a la medianoche (00:00) local de la zona
 * indicada para la fecha calendario `year/month/day`.
 */
function zonedStartOfDayToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const local = getZonedParts(new Date(utc), timeZone);
    const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
    const actual = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      0
    );
    const delta = desired - actual;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

/**
 * Inicio del día civil (00:00 local) para un instante, expresado como UTC.
 */
export function startOfZonedDayUtc(
  date: Date,
  timeZone: string = APP_TIMEZONE
): Date {
  const { year, month, day } = getZonedParts(date, timeZone);
  return zonedStartOfDayToUtc(year, month, day, timeZone);
}

/**
 * Inicio del día de HOY en hora Colombia, expresado como instante UTC.
 *
 * Los timestamps en la base se guardan en UTC; este límite permite contar
 * "hoy" según el día civil colombiano (no la medianoche UTC).
 */
export function startOfTodayUtc(timeZone: string = APP_TIMEZONE): Date {
  return startOfZonedDayUtc(new Date(), timeZone);
}

/**
 * Partes de fecha/hora actuales en Colombia.
 */
export function nowInBogota(): ZonedParts {
  return getZonedParts(new Date(), APP_TIMEZONE);
}

/**
 * Indica si la hora local del país está dentro del rango HH:mm-HH:mm.
 */
export function isWithinContactWindow(
  localHour: number,
  window: string
): boolean {
  const [startRaw, endRaw] = window.split("-");
  const start = Number(startRaw?.split(":")[0] ?? 0);
  const end = Number(endRaw?.split(":")[0] ?? 24);
  return localHour >= start && localHour < end;
}
