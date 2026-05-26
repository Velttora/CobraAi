import { PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./load-seed-env";
import { clearDatabase } from "./seed";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  loadSeedEnv();
  console.info("Borrando todos los datos de la base (seed + tenants)…");
  await clearDatabase();
  console.info("Listo. La base quedó vacía de datos de aplicación.");
}

main()
  .catch((error: unknown) => {
    console.error("Error al limpiar la base:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
