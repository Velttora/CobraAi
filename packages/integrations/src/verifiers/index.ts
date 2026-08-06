import type { IntegrationProvider } from "@cobrai/db";
import type { VerificationResult } from "../types";
import { verifyTwilioAccount, verifyTwilioVoice, verifySendGrid, type VerifierInput } from "./communication-verifiers";
import {
  verifyStripe,
  verifyMercadoPago,
  verifyWompi,
  verifyPayu,
  verifyEpayco,
  verifyNoIntegrationProvider
} from "./payment-verifiers";

export type { VerifierInput } from "./communication-verifiers";

/**
 * Dispatches a live provider health check by `provider` (D-11). Every branch
 * uses the global `fetch` — no provider SDK is imported into this package.
 * `external_link`/`transfer` never call a provider (D-13/D-14, UI-SPEC A-15).
 * The `default` branch covers any genuinely unknown provider, returning a
 * failed `VerificationResult` instead of throwing.
 */
export async function verifyCredentials(
  provider: IntegrationProvider,
  input: VerifierInput
): Promise<VerificationResult> {
  switch (provider) {
    case "twilio_whatsapp":
      return verifyTwilioAccount(provider, input);
    case "twilio_voice":
      return verifyTwilioVoice(provider, input);
    case "sendgrid":
      return verifySendGrid(provider, input);
    case "stripe":
      return verifyStripe(input);
    case "mercadopago":
      return verifyMercadoPago(input);
    case "wompi":
      return verifyWompi(input);
    case "payu":
      return verifyPayu(input);
    case "epayco":
      return verifyEpayco(input);
    case "external_link":
    case "transfer":
      return verifyNoIntegrationProvider();
    default:
      return { ok: false, message: `Verificación no implementada para ${provider}` };
  }
}
