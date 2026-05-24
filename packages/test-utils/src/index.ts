import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";

export type TestDatabase = {
  container: StartedPostgreSqlContainer;
  databaseUrl: string;
  prisma: PrismaClient;
};

const REPO_ROOT = resolve(__dirname, "../../..");
const DB_PACKAGE = resolve(REPO_ROOT, "packages/db");

export async function startPostgres(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("cobrai_test")
    .withUsername("cobrai")
    .withPassword("cobrai_test")
    .start();

  const databaseUrl = container.getConnectionUri();
  pushPrismaSchema(databaseUrl);

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } }
  });
  await prisma.$connect();

  return { container, databaseUrl, prisma };
}

export async function stopPostgres(db?: TestDatabase): Promise<void> {
  if (!db) return;
  await db.prisma.$disconnect();
  await db.container.stop();
}

export function pushPrismaSchema(databaseUrl: string): void {
  execSync("pnpm exec prisma generate", {
    cwd: DB_PACKAGE,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe"
  });
  execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
    cwd: DB_PACKAGE,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe"
  });
}

export async function seedMinimalTenant(prisma: PrismaClient) {
  const tenantId = "org_test_e2e";
  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name: "Test Tenant",
      slug: "test-e2e",
      plan: "trial",
      isActive: true
    },
    update: {}
  });

  const portfolio = await prisma.portfolio.create({
    data: {
      tenantId,
      name: "Cartera Test",
      currency: "COP",
      status: "active"
    }
  });

  const debtor = await prisma.debtor.create({
    data: {
      tenantId,
      name: "María Test",
      email: "maria@test.com",
      phones: ["+573001112233"],
      whatsappOptIn: true,
      address: { country: "CO" }
    }
  });

  await prisma.contactConsent.create({
    data: {
      tenantId,
      debtorId: debtor.id,
      channel: "email",
      source: "import",
      consentedAt: new Date()
    }
  });

  return { tenantId, portfolio, debtor };
}

export function buildCsvRows(count: number): string {
  const header =
    "external_ref,debtor_name,debtor_email,debtor_phone,amount,due_date,currency\n";
  const rows = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return `REF-${n},Deudor ${n},deudor${n}@test.com,+57300${String(n).padStart(7, "0")},${1000 + n},2026-06-${String((n % 28) + 1).padStart(2, "0")},COP`;
  });
  return header + rows.join("\n");
}

export function hasDocker(): boolean {
  try {
    execSync("docker info", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
