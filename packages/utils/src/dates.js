"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowInBogota = nowInBogota;
exports.isWithinContactWindow = isWithinContactWindow;
const BOGOTA_TZ = "America/Bogota";
/**
 * Fecha actual en zona horaria Colombia (referencia LATAM).
 */
function nowInBogota() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: BOGOTA_TZ }));
}
/**
 * Indica si la hora local del país está dentro del rango HH:mm-HH:mm.
 */
function isWithinContactWindow(localHour, window) {
    const [startRaw, endRaw] = window.split("-");
    const start = Number(startRaw?.split(":")[0] ?? 0);
    const end = Number(endRaw?.split(":")[0] ?? 24);
    return localHour >= start && localHour < end;
}
