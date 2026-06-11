import { describe, expect, it } from "vitest";
import { isWithinHours, nextValidSendTime } from "./country-rules";
import { getZonedParts } from "./timezone";

const CO_HOURS = {
  startHour: 8,
  endHour: 18,
  days: [0, 1, 2, 3, 4, 5, 6]
};

describe("isWithinHours (zona horaria local)", () => {
  it("Colombia: 10:00 Bogotá está dentro de ventana", () => {
    const at = new Date("2026-05-26T15:00:00.000Z");
    expect(isWithinHours(at, CO_HOURS, "America/Bogota")).toBe(true);
    expect(getZonedParts(at, "America/Bogota").hour).toBe(10);
  });

  it("Colombia: 07:00 Bogotá está fuera de ventana aunque UTC sea 12:00", () => {
    const at = new Date("2026-05-26T12:00:00.000Z");
    expect(isWithinHours(at, CO_HOURS, "America/Bogota")).toBe(false);
  });

  it("Colombia: 18:00 Bogotá ya está fuera de ventana", () => {
    const at = new Date("2026-05-26T23:00:00.000Z");
    expect(isWithinHours(at, CO_HOURS, "America/Bogota")).toBe(false);
    expect(getZonedParts(at, "America/Bogota").hour).toBe(18);
  });

  it("México: domingo local bloqueado", () => {
    const at = new Date("2026-05-24T16:00:00.000Z"); // dom 10:00 CDMX
    const mxHours = { startHour: 7, endHour: 22, days: [1, 2, 3, 4, 5, 6] };
    expect(isWithinHours(at, mxHours, "America/Mexico_City")).toBe(false);
  });
});

describe("nextValidSendTime", () => {
  it("programa hoy a las 08:00 local si aún no abre la ventana", () => {
    const from = new Date("2026-05-26T11:00:00.000Z"); // 06:00 Bogotá
    const next = nextValidSendTime(from, CO_HOURS, "America/Bogota");
    expect(getZonedParts(next, "America/Bogota").hour).toBe(8);
    expect(getZonedParts(next, "America/Bogota").day).toBe(26);
  });
});
