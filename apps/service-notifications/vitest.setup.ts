/**
 * Test-only envelope-encryption key.
 *
 * `IntegrationsService` refuses credential writes when the key is unusable, so
 * without this every save spec would exercise the refusal path instead of the
 * behaviour it means to test. Deliberately a fixed, obviously-fake value: it
 * never leaves the test process, and a random one would make ciphertext
 * non-reproducible across runs.
 */
process.env.ENCRYPTION_KEY_V1 ??= Buffer.alloc(32, 7).toString("base64");
