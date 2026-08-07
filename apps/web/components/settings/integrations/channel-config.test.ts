import { describe, expect, it } from "vitest";
import { CHANNEL_COPY, remedyFor } from "./channel-config";

describe("remedyFor", () => {
  // El caso real: SendGrid respondió "authorization required" porque la llave
  // de la cuenta padre de la plataforma no estaba configurada, y la pantalla
  // mandaba al tenant a revisar sus CNAME — algo que nunca estuvo mal.
  it("no culpa al DNS del tenant cuando el proveedor rechaza nuestras credenciales", () => {
    const remedy = remedyFor("email", '{"errors":[{"message":"authorization required"}]}');

    expect(remedy).not.toContain("CNAME");
    expect(remedy).toContain("no es tu configuración");
  });

  it("señala permisos cuando el proveedor responde forbidden", () => {
    expect(remedyFor("email", "access forbidden")).toContain("permisos");
  });

  it("conserva el consejo del canal cuando el fallo sí es del tenant", () => {
    expect(remedyFor("email", "The domain is not validated yet")).toBe(CHANNEL_COPY.email.remedy);
    expect(remedyFor("whatsapp", null)).toBe(CHANNEL_COPY.whatsapp.remedy);
  });

  it("sin mensaje de fallo, usa el consejo por defecto de cada canal", () => {
    expect(remedyFor("voice")).toBe(CHANNEL_COPY.voice.remedy);
  });
});
