import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@cobrai/utils": path.resolve(__dirname, "../utils/dist/index.js")
    }
  },
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node"
  }
});
