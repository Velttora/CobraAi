import { ContactChannel, PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./load-seed-env";

const CHANNELS: ContactChannel[] = ["email", "whatsapp", "sms", "voice"];

const prisma = new PrismaClient();

async function main(): Promise<void> {
  loadSeedEnv();

  const debtors = await prisma.debtor.findMany({
    where: { deletedAt: null },
    select: { id: true, tenantId: true, whatsappOptIn: true }
  });

  let created = 0;
  let optInUpdated = 0;

  for (const debtor of debtors) {
    for (const channel of CHANNELS) {
      const existing = await prisma.contactConsent.findFirst({
        where: {
          tenantId: debtor.tenantId,
          debtorId: debtor.id,
          channel,
          revokedAt: null,
          deletedAt: null
        }
      });
      if (existing) continue;

      await prisma.contactConsent.create({
        data: {
          tenantId: debtor.tenantId,
          debtorId: debtor.id,
          channel,
          source: "import",
          consentedAt: new Date()
        }
      });
      created++;
    }

    if (!debtor.whatsappOptIn) {
      await prisma.debtor.update({
        where: { id: debtor.id },
        data: { whatsappOptIn: true }
      });
      optInUpdated++;
    }
  }

  console.info(
    `Consentimientos: ${created} registros creados para ${debtors.length} deudores. WhatsApp opt-in actualizado en ${optInUpdated}.`
  );
}

main()
  .catch((error: unknown) => {
    console.error("Error al rellenar consentimientos:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
