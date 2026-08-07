import type { VerificationResult } from "../types";
import type { VerifierInput } from "./communication-verifiers";

/**
 * `GET /v1/balance` — Stripe's documented "retrieve balance" endpoint,
 * read-only, requires only a valid secret key. Confirmed live against
 * https://api.stripe.com/v1/balance (401 on a missing/invalid key) 2026-08-04.
 */
export async function verifyStripe(input: VerifierInput): Promise<VerificationResult> {
  const secretKey = input.secrets["secretKey"] ?? "";
  try {
    const response = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    if (!response.ok) {
      const detail = await extractJsonOrText(response, (body) => (body as { error?: { message?: string } }).error?.message);
      return { ok: false, message: detail };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "No se pudo contactar a stripe" };
  }
}

/**
 * `GET /users/me` — Mercado Pago's authenticated "who am I" endpoint,
 * read-only. Confirmed live against https://api.mercadopago.com/users/me
 * (403 without a Bearer token) 2026-08-04.
 */
export async function verifyMercadoPago(input: VerifierInput): Promise<VerificationResult> {
  const accessToken = input.secrets["accessToken"] ?? "";
  try {
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const detail = await extractJsonOrText(response, (body) => (body as { message?: string }).message);
      return { ok: false, message: detail };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "No se pudo contactar a mercadopago" };
  }
}

/**
 * `GET /v1/merchants/{public_key}` — Wompi's documented merchant lookup.
 *
 * This previously called `GET /v1/payment_links?page[size]=1`, which Wompi
 * does not document: its Payment Links API is POST to create and GET by id
 * (the latter unauthenticated). That call answered 401 INVALID_ACCESS_TOKEN
 * for every private key, valid or not, so verification could only ever fail —
 * the original check had been confirmed against a *bad* key and never against
 * a good one, which is exactly the gap that hides this class of bug.
 *
 * What this verifies and what it does not:
 * - The public key is well-formed and belongs to a real, active merchant.
 *   That is the account-level fact worth confirming before a tenant tries to
 *   collect, and it is what catches a sandbox key pasted into production.
 * - It does NOT prove the private key works. Wompi exposes no read-only
 *   endpoint that authenticates one, and creating a real payment link just to
 *   check would leave litter in the merchant's account. A bad private key
 *   therefore surfaces on the first checkout, carrying Wompi's own message.
 */
export async function verifyWompi(input: VerifierInput): Promise<VerificationResult> {
  const publicKey = input.publicConfig["publicKey"] ?? "";
  const privateKey = input.secrets["privateKey"] ?? "";

  if (!publicKey) {
    return { ok: false, message: "Falta la llave pública de Wompi" };
  }
  if (!privateKey.startsWith("prv_")) {
    return {
      ok: false,
      message: "La llave privada de Wompi debe empezar con prv_test_ o prv_prod_"
    };
  }
  if (publicKey.startsWith("pub_test_") !== privateKey.startsWith("prv_test_")) {
    return {
      ok: false,
      message: "Las llaves de Wompi son de ambientes distintos: ambas deben ser de prueba o ambas de producción"
    };
  }

  try {
    const response = await fetch(
      `https://production.wompi.co/v1/merchants/${encodeURIComponent(publicKey)}`
    );
    if (!response.ok) {
      const detail = await extractJsonOrText(
        response,
        (body) =>
          (body as { error?: { reason?: string } }).error?.reason ??
          "Wompi no reconoce esta llave pública. Revisa que sea la de producción y que la cuenta esté activa."
      );
      return { ok: false, message: detail };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "No se pudo contactar a wompi" };
  }
}

/**
 * `POST /payments-api/4.0/service.cgi` with `command: "PING"` — PayU's
 * documented connectivity/credential test command against the Payments API.
 * Confirmed live against https://api.payulatam.com/payments-api/4.0/service.cgi
 * (`{"code":"ERROR","error":"Credenciales inválidas"}` on invalid
 * apiLogin/apiKey, with `Accept: application/json`) 2026-08-04.
 */
export async function verifyPayu(input: VerifierInput): Promise<VerificationResult> {
  const apiKey = input.secrets["apiKey"] ?? "";
  const apiLogin = input.secrets["apiLogin"] ?? "";
  try {
    const response = await fetch("https://api.payulatam.com/payments-api/4.0/service.cgi", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        test: false,
        language: "es",
        command: "PING",
        merchant: { apiLogin, apiKey }
      })
    });
    const body = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
    if (body.code !== "SUCCESS") {
      return { ok: false, message: body.error ?? "Credenciales inválidas" };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "No se pudo contactar a payu" };
  }
}

/**
 * `POST /login` — ePayco's REST API authentication endpoint, exchanging
 * `public_key`/`private_key` for a bearer token; a failure response
 * indicates invalid credentials without mutating any ePayco state.
 * Endpoint confidence: LOW — this session could not confirm a stable,
 * non-cached response from a live call (see 08-09 SUMMARY "Known Stubs"),
 * consistent with 08-08's own LOW-confidence flag on ePayco's checkout
 * endpoint. Must be verified with real ePayco sandbox credentials before
 * any tenant goes live on ePayco.
 */
export async function verifyEpayco(input: VerifierInput): Promise<VerificationResult> {
  const publicKey = input.publicConfig["publicKey"] ?? "";
  const privateKey = input.secrets["pKey"] ?? "";
  try {
    const response = await fetch("https://apify.epayco.co/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key: publicKey, private_key: privateKey })
    });
    const body = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!response.ok || !body.token) {
      return { ok: false, message: body.error ?? "Credenciales inválidas" };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "No se pudo contactar a epayco" };
  }
}

/**
 * `external_link`/`transfer` have no provider to call — D-13/D-14 and
 * UI-SPEC A-15: saving either performs no health check and goes straight to
 * `verified` with `verifiedAt` (the caller passes `skipVerification`), but
 * the UI badge label for these two is `Configurado`, never `Verificado`,
 * because nothing was actually checked against a provider.
 */
export function verifyNoIntegrationProvider(): VerificationResult {
  return { ok: true };
}

/** Reads the body once as text, then attempts to parse it as JSON for a nested message field. */
async function extractJsonOrText(
  response: Response,
  pickMessage: (body: unknown) => string | undefined
): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw);
    const message = pickMessage(parsed);
    if (message) return message;
  } catch {
    // not JSON — fall through to raw text
  }
  return raw || "error desconocido";
}
