import { ContactChannel, PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./load-seed-env";

const prisma = new PrismaClient();

function inferChannel(name: string, current: ContactChannel | null): ContactChannel {
  const lower = name.toLowerCase();
  if (lower.includes("email")) return "email";
  if (lower.includes("whatsapp")) return "whatsapp";
  if (lower.includes("voz") || lower.includes("llamada")) return "voice";
  return current ?? "whatsapp";
}

function thankYouName(name: string, channel: ContactChannel): string {
  if (name.toLowerCase().includes("agradecimiento")) return name;
  if (name.toLowerCase().includes("cerrar")) {
    const channelLabel =
      channel === "email" ? "email" : channel === "voice" ? "voz" : "WhatsApp";
    return name
      .replace(/cerrar cuenta/i, `agradecimiento ${channelLabel}`)
      .replace(/— cerrar/i, `— agradecimiento ${channelLabel}`);
  }
  return `${name} — agradecimiento`;
}

async function main(): Promise<void> {
  loadSeedEnv();

  const rules = await prisma.workflowRule.findMany({
    where: {
      trigger: "payment_confirmed",
      action: "update_status",
      deletedAt: null
    },
    select: { id: true, name: true, channel: true }
  });

  let updated = 0;
  for (const rule of rules) {
    const channel = inferChannel(rule.name, rule.channel);
    await prisma.workflowRule.update({
      where: { id: rule.id },
      data: {
        action: "send_notification",
        channel,
        name: thankYouName(rule.name, channel)
      }
    });
    updated++;
  }

  console.info(
    `Reglas de pago confirmado: ${updated} actualizadas a send_notification con canal de agradecimiento.`
  );
}

main()
  .catch((error: unknown) => {
    console.error("Error al actualizar reglas de pago confirmado:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
