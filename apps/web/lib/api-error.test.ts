import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api-error";

const FALLBACK = "No se pudo guardar. Revisa tu conexión e intenta de nuevo.";

describe("apiErrorMessage", () => {
  // El caso que motivó esto: faltaba ENCRYPTION_KEY_V1, el servidor lo dijo
  // con claridad, y la UI lo mostraba como "revisa tu conexión" — mandando al
  // usuario a buscar un problema de red que no existía.
  it("muestra el mensaje del servidor en vez del genérico de red", () => {
    const error = {
      response: {
        status: 500,
        data: { statusCode: 500, message: "ENCRYPTION_KEY_V1 no está configurada." }
      }
    };

    expect(apiErrorMessage(error)).toBe("ENCRYPTION_KEY_V1 no está configurada.");
  });

  it("junta los mensajes de una validación fallida", () => {
    const error = {
      response: {
        status: 400,
        data: { message: ["mode debe ser managed o byo", "publicConfig debe ser un objeto"] }
      }
    };

    expect(apiErrorMessage(error)).toBe(
      "mode debe ser managed o byo. publicConfig debe ser un objeto"
    );
  });

  it("solo usa el mensaje de red cuando la petición nunca obtuvo respuesta", () => {
    expect(apiErrorMessage(new Error("Network Error"))).toBe(FALLBACK);
    expect(apiErrorMessage(undefined)).toBe(FALLBACK);
  });

  it("traduce un 403 sin cuerpo a una explicación de permisos", () => {
    expect(apiErrorMessage({ response: { status: 403, data: {} } })).toBe(
      "No tienes permisos para hacer este cambio."
    );
  });

  it("señala al servidor en un 5xx sin cuerpo, en vez de culpar a la red", () => {
    expect(apiErrorMessage({ response: { status: 502, data: null } })).toBe(
      "El servidor falló al guardar. Revisa los logs del servicio."
    );
  });
});
