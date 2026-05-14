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

export const prisma = new PrismaClient();

export * from "@prisma/client";
