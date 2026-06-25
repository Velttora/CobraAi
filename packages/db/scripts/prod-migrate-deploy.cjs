/**
 * Aplica migraciones Prisma pendientes en Fly (sin CLI).
 * Uso: ver infra/fly/run-prod-migrate.sh
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const migrationsDir = "/app/prisma-migrate/migrations";

async function appliedMigrations() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`
  );
  return new Set(rows.map((row) => row.migration_name));
}

function migrationChecksum(sql) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

/** Quita comentarios `--` y divide en sentencias SQL ejecutables. */
function splitSqlStatements(sql) {
  const withoutComments = sql.replace(/^--.*$/gm, "").trim();
  return withoutComments
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

async function executeStatements(statements) {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function recordMigration(name, sql) {
  const checksum = migrationChecksum(sql);
  const existing = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '${name}' AND rolled_back_at IS NULL LIMIT 1`
  );
  if (Array.isArray(existing) && existing.length > 0) return;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES (gen_random_uuid(), '${checksum}', NOW(), '${name}', NULL, NULL, NOW(), 1)`
  );
}

async function applyMigration(name, sql) {
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) {
    throw new Error(`Migración ${name} no tiene sentencias SQL ejecutables`);
  }
  await executeStatements(statements);
  await recordMigration(name, sql);
}

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public.${tableName}')::text AS name`
  );
  return Boolean(rows[0]?.name);
}

async function repairEmailLayoutMigration() {
  if (await tableExists("email_layouts")) return false;

  const name = "20260616130000_email_layout_and_template_subject";
  const sqlPath = path.join(migrationsDir, name, "migration.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`No se encontró ${sqlPath} para reparar email_layouts`);
  }

  console.log(`→ Reparando ${name} (tabla email_layouts ausente)`);
  const sql = fs.readFileSync(sqlPath, "utf8");
  await executeStatements(splitSqlStatements(sql));
  await recordMigration(name, sql);
  return true;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está configurada en el runtime.");
  }

  const applied = await appliedMigrations();
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  let count = 0;
  for (const name of entries) {
    if (applied.has(name)) {
      console.log(`· ${name} ya aplicada`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, name, "migration.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log(`→ Aplicando ${name}`);
    await applyMigration(name, sql);
    count++;
  }

  if (await repairEmailLayoutMigration()) {
    count++;
  }

  console.log(
    count === 0
      ? "Sin migraciones pendientes."
      : `${count} migración(es) aplicada(s) o reparada(s).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
