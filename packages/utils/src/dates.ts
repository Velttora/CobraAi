const BOGOTA_TZ = "America/Bogota";

/**
 * Fecha actual en zona horaria Colombia (referencia LATAM).
 */
export function nowInBogota(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: BOGOTA_TZ })
  );
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
