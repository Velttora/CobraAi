/**
 * Idempotently seeds Colombian national holidays (2026 + 2027) in production (Fly).
 * Mirrors packages/db/src/seed-holidays.ts. Uso: ver infra/fly/run-prod-seed-holidays.sh
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// 18 holidays per year (Ley Emiliani Monday shifts + Holy Week). Names in Spanish (content).
const HOLIDAYS_CO = [
  { date: "2026-01-01", name: "Año Nuevo" },
  { date: "2026-01-12", name: "Día de los Reyes Magos" },
  { date: "2026-03-23", name: "Día de San José" },
  { date: "2026-04-02", name: "Jueves Santo" },
  { date: "2026-04-03", name: "Viernes Santo" },
  { date: "2026-05-01", name: "Día del Trabajo" },
  { date: "2026-05-18", name: "Ascensión del Señor" },
  { date: "2026-06-08", name: "Corpus Christi" },
  { date: "2026-06-15", name: "Sagrado Corazón de Jesús" },
  { date: "2026-06-29", name: "San Pedro y San Pablo" },
  { date: "2026-07-20", name: "Día de la Independencia" },
  { date: "2026-08-07", name: "Batalla de Boyacá" },
  { date: "2026-08-17", name: "Asunción de la Virgen" },
  { date: "2026-10-12", name: "Día de la Raza" },
  { date: "2026-11-02", name: "Día de Todos los Santos" },
  { date: "2026-11-16", name: "Independencia de Cartagena" },
  { date: "2026-12-08", name: "Inmaculada Concepción" },
  { date: "2026-12-25", name: "Navidad" },
  { date: "2027-01-01", name: "Año Nuevo" },
  { date: "2027-01-11", name: "Día de los Reyes Magos" },
  { date: "2027-03-22", name: "Día de San José" },
  { date: "2027-03-25", name: "Jueves Santo" },
  { date: "2027-03-26", name: "Viernes Santo" },
  { date: "2027-05-01", name: "Día del Trabajo" },
  { date: "2027-05-10", name: "Ascensión del Señor" },
  { date: "2027-05-31", name: "Corpus Christi" },
  { date: "2027-06-07", name: "Sagrado Corazón de Jesús" },
  { date: "2027-07-05", name: "San Pedro y San Pablo" },
  { date: "2027-07-20", name: "Día de la Independencia" },
  { date: "2027-08-07", name: "Batalla de Boyacá" },
  { date: "2027-08-16", name: "Asunción de la Virgen" },
  { date: "2027-10-18", name: "Día de la Raza" },
  { date: "2027-11-01", name: "Día de Todos los Santos" },
  { date: "2027-11-15", name: "Independencia de Cartagena" },
  { date: "2027-12-08", name: "Inmaculada Concepción" },
  { date: "2027-12-25", name: "Navidad" }
];

async function main() {
  // Raw SQL (not prisma.holiday.*) because the deployed app's generated client may
  // predate the Holiday model. Idempotent via ON CONFLICT on the unique `date` column.
  for (const holiday of HOLIDAYS_CO) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "holidays" ("date", "name") VALUES ($1::date, $2)
       ON CONFLICT ("date") DO UPDATE SET "name" = EXCLUDED."name"`,
      holiday.date,
      holiday.name
    );
  }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM "holidays"`
  );
  console.log(
    `Festivos CO upsertados: ${HOLIDAYS_CO.length}. Total en holidays: ${rows[0].c}.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
