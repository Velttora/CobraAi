import { describe, expect, it } from "vitest";
import { EpaycoGateway } from "./epayco.gateway";
import type { CreateCheckoutInput } from "./gateway.types";

describe("EpaycoGateway", () => {
  const gateway = new EpaycoGateway();

  const baseInput: CreateCheckoutInput = {
    amount: 450000,
    currency: "COP",
    token: "tok-epayco-654",
    debtorName: "Jane Doe",
    publicConfig: { custIdCliente: "12345", publicKey: "pub_test_epayco" },
    secrets: { privateKey: "priv_test_epayco" },
    returnUrl: "https://app.cobrai.dev/pay/return"
  };

  // El endpoint `checkout.epayco.co/checkout.php` devuelve HTTP 403 desde el
  // 2026-08-06 (verificado en vivo; el mismo host sigue sirviendo checkout.js
  // con 200, así que es el endpoint que desapareció, no el host). Entregarle
  // al deudor una URL que da 403 significa que no puede pagar y el tenant solo
  // se entera por una deuda impaga, así que el gateway falla al crear el link.
  it("falla de forma explícita en vez de entregar una URL muerta", async () => {
    await expect(gateway.createCheckout(baseInput)).rejects.toThrow(
      /deshabilitada/
    );
  });

  it("el mensaje de error le dice al tenant qué hacer mientras tanto", async () => {
    await expect(gateway.createCheckout(baseInput)).rejects.toThrow(
      /Configura otro proveedor de cobro/
    );
  });

  // Cuando se restaure el gateway contra un sandbox real, estos son los
  // invariantes que la implementación anterior cumplía y que la nueva debe
  // seguir cumpliendo: la llave privada nunca viaja en la URL, el token va
  // como `invoice` (ePayco lo devuelve en `x_id_factura`, que lee el webhook
  // del plan 08-12) y el monto va con dos decimales exactos.
  it.skip("[restauración] lleva el token como invoice y nunca la llave privada", async () => {
    const result = await gateway.createCheckout(baseInput);
    const url = new URL(result.gateway_payment_url);

    expect(url.searchParams.get("invoice")).toBe("tok-epayco-654");
    expect(url.searchParams.get("amount")).toBe("450000.00");
    expect(url.searchParams.get("currency")).toBe("cop");
    expect(result.gateway_payment_url).not.toContain("priv_test_epayco");
  });
});
