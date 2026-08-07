import { describe, expect, it } from "vitest";
import { buildPublicPayload, requiredValueFor, savedNumberFrom } from "./channel-config";

const WHATSAPP_REQUIRED = ["accountSid", "phoneNumberE164"];

describe("savedNumberFrom", () => {
  it("lee el número de WhatsApp guardado, que el backend almacena como fromNumber", () => {
    expect(savedNumberFrom({ accountSid: "AC1", fromNumber: "whatsapp:+573001234567" })).toBe(
      "+573001234567"
    );
  });

  it("lee el número de voz guardado, almacenado como outboundNumber", () => {
    expect(savedNumberFrom({ outboundNumber: "+573001234567" })).toBe("+573001234567");
  });

  // Sin esto el campo se congelaría: el valor guardado ganaría sobre lo tecleado.
  it("lo que el usuario está escribiendo gana sobre el valor guardado", () => {
    expect(savedNumberFrom({ fromNumber: "whatsapp:+573001111111", phoneNumberE164: "+5730022" })).toBe(
      "+5730022"
    );
  });

  it("un campo vaciado a propósito se queda vacío", () => {
    expect(savedNumberFrom({ fromNumber: "whatsapp:+573001111111", phoneNumberE164: "" })).toBe("");
  });

  it("sin nada guardado devuelve vacío", () => {
    expect(savedNumberFrom({})).toBe("");
  });
});

describe("buildPublicPayload", () => {
  // El caso del bug: recargar y corregir solo el SID borraba el número.
  it("reenvía el número guardado cuando el usuario solo editó otro campo", () => {
    const saved = { accountSid: "AC_old", fromNumber: "whatsapp:+573001234567" };
    const payload = buildPublicPayload(WHATSAPP_REQUIRED, { accountSid: "AC_new" }, {
      ...saved,
      accountSid: "AC_new"
    });

    expect(payload).toEqual({ accountSid: "AC_new", phoneNumberE164: "+573001234567" });
  });

  it("no pisa lo que el usuario sí editó", () => {
    const payload = buildPublicPayload(WHATSAPP_REQUIRED, { phoneNumberE164: "+573009999999" }, {
      accountSid: "AC1",
      fromNumber: "whatsapp:+573001234567",
      phoneNumberE164: "+573009999999"
    });

    expect(payload.phoneNumberE164).toBe("+573009999999");
  });

  it("conserva campos editados que no son obligatorios", () => {
    const payload = buildPublicPayload(["accountSid"], { businessName: "Acme" }, { accountSid: "AC1" });
    expect(payload).toEqual({ businessName: "Acme", accountSid: "AC1" });
  });
});

describe("requiredValueFor", () => {
  it("marca el formulario como completo con un número ya guardado", () => {
    expect(requiredValueFor("phoneNumberE164", { fromNumber: "whatsapp:+573001234567" })).not.toBe("");
  });

  it("los demás campos se leen tal cual", () => {
    expect(requiredValueFor("accountSid", { accountSid: "AC1" })).toBe("AC1");
    expect(requiredValueFor("accountSid", {})).toBe("");
  });
});
