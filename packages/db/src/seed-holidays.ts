import { PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./load-seed-env";

// Colombian national public holidays for 2026 and 2027 (18 per year), including the
// Ley Emiliani Monday-shifted holidays and the Holy Week / Easter-based ones.
// Names are kept in Spanish because they are content (the holiday's official name).
// `date` is the civil calendar date in YYYY-MM-DD; when parsed by `new Date(...)` it
// is interpreted as UTC-midnight, which MUST match the key the compliance engine
// builds when it queries `prisma.holiday.findFirst({ where: { date } })`.
type HolidaySeed = { date: string; name: string };

const HOLIDAYS_CO: HolidaySeed[] = [
  // 2026
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
  // 2027
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

const prisma = new PrismaClient();

async function main(): Promise<void> {
  loadSeedEnv();

  // Upsert on the unique `date` column so re-running is idempotent (no duplicate rows).
  for (const holiday of HOLIDAYS_CO) {
    const date = new Date(`${holiday.date}T00:00:00.000Z`);
    await prisma.holiday.upsert({
      where: { date },
      update: { name: holiday.name },
      create: { date, name: holiday.name }
    });
  }

  console.info(`Festivos CO cargados: ${HOLIDAYS_CO.length} (2026 + 2027).`);
}

main()
  .catch((error: unknown) => {
    console.error("Error al cargar festivos:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
