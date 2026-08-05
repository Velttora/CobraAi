import type { IntegrationProvider } from "@cobrai/db";
import type { VerificationResult } from "../types";

/**
 * Dispatches a live provider health check by `provider`. Implemented fully in
 * a follow-up task (three communication-channel verifiers); the `default`
 * branch below already covers every provider that has no case yet, so this
 * never throws for an unimplemented provider.
 */
export async function verifyCredentials(
  provider: IntegrationProvider,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  input: { publicConfig: Record<string, string>; secrets: Record<string, string> }
): Promise<VerificationResult> {
  switch (provider) {
    default:
      return { ok: false, message: `Verificación no implementada para ${provider}` };
  }
}
