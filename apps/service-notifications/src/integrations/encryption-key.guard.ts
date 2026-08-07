/**
 * Boot-time assertion that the envelope-encryption master key is usable.
 *
 * Without it the service starts perfectly happily and every credential save
 * fails at the moment a tenant presses Guardar — the throw happens deep inside
 * `encryptSecretBundle`, surfaces to the browser as a generic 500, and reads to
 * the user as a connectivity problem. Checking at boot turns a confusing
 * runtime failure into an unmissable startup error naming the exact variable.
 *
 * The key is only read here for validation; it is never logged.
 */
export function assertEncryptionKeyConfigured(env: NodeJS.ProcessEnv = process.env): void {
  const version = env.ENCRYPTION_KEY_VERSION ?? "1";
  const varName = `ENCRYPTION_KEY_V${version}`;
  const raw = env[varName];

  if (!raw) {
    throw new Error(
      `${varName} no está configurada. Sin la llave maestra no se puede cifrar ` +
        `ninguna credencial de tenant, así que todo guardado en Settings > Integraciones ` +
        `fallaría. Genera 32 bytes en base64 con: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  if (Buffer.from(raw, "base64").length !== 32) {
    throw new Error(
      `${varName} debe decodificar a exactamente 32 bytes para AES-256. ` +
        `Genera una llave válida con: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
}
