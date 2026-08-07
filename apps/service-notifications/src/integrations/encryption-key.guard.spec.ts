import { describe, expect, it } from "vitest";
import { checkEncryptionKey } from "./encryption-key.guard";

const VALID = Buffer.alloc(32, 3).toString("base64");

describe("checkEncryptionKey", () => {
  it("acepta una llave de 32 bytes", () => {
    expect(checkEncryptionKey({ ENCRYPTION_KEY_V1: VALID }).usable).toBe(true);
  });

  it("nombra la variable que falta, para que no haya que adivinar", () => {
    const result = checkEncryptionKey({});

    expect(result.usable).toBe(false);
    expect(result.reason).toContain("ENCRYPTION_KEY_V1");
  });

  it("rechaza una llave que no decodifica a 32 bytes", () => {
    const result = checkEncryptionKey({ ENCRYPTION_KEY_V1: "corta" });

    expect(result.usable).toBe(false);
    expect(result.reason).toContain("32 bytes");
  });

  it("respeta ENCRYPTION_KEY_VERSION al elegir qué variable leer", () => {
    const result = checkEncryptionKey({ ENCRYPTION_KEY_VERSION: "2", ENCRYPTION_KEY_V2: VALID });

    expect(result.usable).toBe(true);
    expect(checkEncryptionKey({ ENCRYPTION_KEY_VERSION: "2" }).reason).toContain(
      "ENCRYPTION_KEY_V2"
    );
  });

  // El motivo se registra en logs y se devuelve al cliente: nunca puede llevar
  // el material de la llave.
  it("nunca incluye el valor de la llave en el motivo", () => {
    const result = checkEncryptionKey({ ENCRYPTION_KEY_V1: "AAAA" });

    expect(result.reason).not.toContain("AAAA");
  });
});

