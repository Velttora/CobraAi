import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return;
  }

  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, ".env"),
    resolve(cwd, ".env.local"),
    resolve(cwd, "../../.env"),
    resolve(cwd, "../../.env.local"),
    join(__dirname, "../../../../../.env"),
    join(__dirname, "../../../../../.env.local")
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) {
      continue;
    }

    loadEnv({
      path: envPath,
      override: false
    });

    if (process.env.DATABASE_URL) {
      return;
    }
  }
}

ensureDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export type { PrismaClient } from "@prisma/client";
export { PrismaService } from "./prisma.service";
export { ensureTenantRecord, tenantSlugFromId } from "./ensure-tenant";
