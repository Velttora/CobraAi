import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  currentKeyVersion,
  decryptSecretBundle,
  encryptSecretBundle,
  lastFour
} from "./envelope-encryption";

// Fixed 32-byte test key, base64-encoded. Never rely on a developer's real
// .env — the key is set here and restored afterwards.
const TEST_KEY_V1 = Buffer.alloc(32, 7).toString("base64");
const TEST_KEY_V2 = Buffer.alloc(32, 9).toString("base64");

describe("envelope-encryption", () => {
  let originalKeyV1: string | undefined;
  let originalKeyV2: string | undefined;
  let originalKeyVersion: string | undefined;

  beforeEach(() => {
    originalKeyV1 = process.env["ENCRYPTION_KEY_V1"];
    originalKeyV2 = process.env["ENCRYPTION_KEY_V2"];
    originalKeyVersion = process.env["ENCRYPTION_KEY_VERSION"];
    process.env["ENCRYPTION_KEY_V1"] = TEST_KEY_V1;
    process.env["ENCRYPTION_KEY_V2"] = TEST_KEY_V2;
    delete process.env["ENCRYPTION_KEY_VERSION"];
  });

  afterEach(() => {
    if (originalKeyV1 === undefined) delete process.env["ENCRYPTION_KEY_V1"];
    else process.env["ENCRYPTION_KEY_V1"] = originalKeyV1;
    if (originalKeyV2 === undefined) delete process.env["ENCRYPTION_KEY_V2"];
    else process.env["ENCRYPTION_KEY_V2"] = originalKeyV2;
    if (originalKeyVersion === undefined) delete process.env["ENCRYPTION_KEY_VERSION"];
    else process.env["ENCRYPTION_KEY_VERSION"] = originalKeyVersion;
  });

  it("round-trips a secret bundle back to the exact original value", () => {
    const { ciphertext } = encryptSecretBundle({ authToken: "abc" }, 1);
    expect(decryptSecretBundle(ciphertext, 1)).toEqual({ authToken: "abc" });
  });

  it("round-trips UTF-8 multi-byte content", () => {
    const secrets = { note: "contraseña ñoño 🔒" };
    const { ciphertext } = encryptSecretBundle(secrets, 1);
    expect(decryptSecretBundle(ciphertext, 1)).toEqual(secrets);
  });

  it("throws instead of returning garbage when ciphertext is tampered with", () => {
    const { ciphertext } = encryptSecretBundle({ authToken: "abc" }, 1);
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;
    expect(() => decryptSecretBundle(tampered, 1)).toThrow();
  });

  it("throws naming the missing env var when the key version has no configured key", () => {
    expect(() => decryptSecretBundle(Buffer.alloc(28), 3)).toThrow(/ENCRYPTION_KEY_V3/);
  });

  it("throws at encrypt time when the key decodes to fewer than 32 bytes", () => {
    process.env["ENCRYPTION_KEY_V1"] = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecretBundle({ authToken: "abc" }, 1)).toThrow(/32 bytes/);
  });

  it("produces different ciphertext for identical input on each call (random IV)", () => {
    const first = encryptSecretBundle({ authToken: "abc" }, 1);
    const second = encryptSecretBundle({ authToken: "abc" }, 1);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it("lastFour returns the trailing 4 characters", () => {
    expect(lastFour("sk_live_abcd1234")).toBe("1234");
  });

  it("lastFour returns the whole string when shorter than 4 characters", () => {
    expect(lastFour("abc")).toBe("abc");
  });

  it("lastFour returns an empty string for empty input", () => {
    expect(lastFour("")).toBe("");
  });

  it("currentKeyVersion defaults to 1 when ENCRYPTION_KEY_VERSION is unset", () => {
    expect(currentKeyVersion()).toBe(1);
  });

  it("currentKeyVersion returns the parsed integer when set", () => {
    process.env["ENCRYPTION_KEY_VERSION"] = "2";
    expect(currentKeyVersion()).toBe(2);
  });

  it("encrypts and decrypts using a non-default key version", () => {
    const { ciphertext, keyVersion } = encryptSecretBundle({ apiKey: "xyz" }, 2);
    expect(keyVersion).toBe(2);
    expect(decryptSecretBundle(ciphertext, 2)).toEqual({ apiKey: "xyz" });
  });
});
