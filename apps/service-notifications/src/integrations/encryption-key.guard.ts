/**
 * Availability of the envelope-encryption master key.
 *
 * Credential storage needs it; nothing else in this service does. WhatsApp,
 * email, voice, conversations and the inbound webhooks all work without it, so
 * a missing key must NOT take the service down — an earlier version of this
 * guard aborted the process at boot and turned a feature-scoped configuration
 * gap into a total outage of every channel.
 *
 * The failure still has to be impossible to miss, because the alternative is
 * the original bug: saving a credential fails with a generic 500 that reads as
 * a network problem. So the key is checked once at boot, logged loudly if it is
 * unusable, and the integrations endpoints refuse with an explanation naming
 * the variable — while the rest of the service keeps running.
 */

export interface EncryptionKeyStatus {
  usable: boolean;
  /** Operator-facing reason, safe to log and to return. Never contains the key. */
  reason?: string;
}

export function checkEncryptionKey(env: NodeJS.ProcessEnv = process.env): EncryptionKeyStatus {
  const version = env.ENCRYPTION_KEY_VERSION ?? "1";
  const varName = `ENCRYPTION_KEY_V${version}`;
  const raw = env[varName];

  if (!raw) {
    return {
      usable: false,
      reason:
        `${varName} no está configurada. Sin la llave maestra no se puede cifrar ` +
        `ninguna credencial de tenant, así que Settings > Integraciones no puede guardar. ` +
        `Genérala con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    };
  }

  if (Buffer.from(raw, "base64").length !== 32) {
    return {
      usable: false,
      reason: `${varName} debe decodificar a exactamente 32 bytes para AES-256.`
    };
  }

  return { usable: true };
}
