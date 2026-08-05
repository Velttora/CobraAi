import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * AES-256-GCM envelope encryption for tenant credentials (D-08).
 *
 * Storage layout: iv (12 bytes) || ciphertext (n bytes) || authTag (16 bytes),
 * concatenated into a single Buffer. The master key is never stored in the
 * database — it lives in `ENCRYPTION_KEY_V{n}` env vars, one per key version,
 * so rotating the key means adding a new env var and re-encrypting rows
 * lazily without downtime (T-08-KR).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV, GCM-recommended size
const AUTH_TAG_LENGTH = 16;

export interface EncryptedSecret {
  ciphertext: Buffer; // iv (12) || ciphertext (n) || authTag (16), concatenated
  keyVersion: number;
}

/**
 * Resolves the AES-256 master key for a given version from
 * `ENCRYPTION_KEY_V{keyVersion}`. Never logs or includes the key or any
 * plaintext in a thrown message (T-08-01c).
 */
function resolveKey(keyVersion: number): Buffer {
  const raw = process.env[`ENCRYPTION_KEY_V${keyVersion}`];
  if (!raw) {
    throw new Error(
      `No encryption key configured for keyVersion=${keyVersion} (expected ENCRYPTION_KEY_V${keyVersion})`
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY_V${keyVersion} must decode to 32 bytes for AES-256`);
  }
  return key;
}

/** Reads `ENCRYPTION_KEY_VERSION` from env, defaulting to `1`. */
export function currentKeyVersion(): number {
  const raw = process.env["ENCRYPTION_KEY_VERSION"];
  return raw ? parseInt(raw, 10) : 1;
}

/**
 * Encrypts a bundle of secrets (e.g. `{ authToken, apiKey }`) as JSON,
 * returning a single ciphertext Buffer tagged with the key version used.
 * A fresh random IV is generated on every call.
 */
export function encryptSecretBundle(
  secrets: Record<string, string>,
  keyVersion: number = currentKeyVersion()
): EncryptedSecret {
  const key = resolveKey(keyVersion);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(secrets);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, encrypted, authTag]), keyVersion };
}

/**
 * Decrypts a ciphertext produced by `encryptSecretBundle`, verifying the
 * GCM auth tag before returning. Throws instead of returning a value when
 * the ciphertext has been tampered with (T-08-01b).
 */
export function decryptSecretBundle(
  ciphertext: Buffer,
  keyVersion: number
): Record<string, string> {
  const key = resolveKey(keyVersion);
  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH, ciphertext.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted) as Record<string, string>;
}

/**
 * Returns the trailing 4 characters of a secret for display purposes
 * (D-26 — secret fields are write-only in the UI). Returns the whole
 * string when it is shorter than 4 characters.
 */
export function lastFour(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}
