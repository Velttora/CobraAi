// Server-only entry point for envelope encryption.
//
// This shim exists so both module-resolution modes in this monorepo can reach
// the crypto module: packages on `moduleResolution: "Node"` (node10) resolve
// `@cobrai/utils/crypto` to this file directly, while modern resolvers go
// through the `./crypto` entry in package.json `exports`.
//
// Crypto is deliberately NOT re-exported from `src/index.ts`: that barrel is
// imported by the Next.js app, and bundling `node:crypto` for the browser both
// breaks the build and puts secret-handling code in the client bundle.
module.exports = require("./dist/crypto/envelope-encryption");
