import { PrismaClient } from "@prisma/client";
import { loadSeedEnv } from "./load-seed-env";

/**
 * Pone condición `status = paid_full` a las reglas de agradecimiento por pago
 * que hoy no tienen ninguna.
 *
 * Sin condición, el "gracias por su pago" salía con cualquier abono: al deudor
 * que pagó el 10% se le confirmaba que su cuenta quedaba bien. Los paquetes
 * sembrados ya salen con la condición; esto alcanza a los tenants que aplicaron
 * un paquete antes del cambio.
 *
 * Solo toca reglas con condición vacía: si alguien afinó la suya a mano, se
 * respeta.
 */
const prisma = new PrismaClient();

function isEmptyCondition(condition: unknown): boolean {
  if (!condition || typeof condition !== "object") return true;
  return Object.keys(condition as Record<string, unknown>).length === 0;
}

async function main(): Promise<void> {
  loadSeedEnv();

  const rules = await prisma.workflowRule.findMany({
    where: {
      trigger: "payment_confirmed",
      action: "send_notification",
      deletedAt: null
    },
    select: { id: true, name: true, condition: true }
  });

  let updated = 0;
  let skipped = 0;
  for (const rule of rules) {
    if (!isEmptyCondition(rule.condition)) {
      skipped++;
      continue;
    }
    await prisma.workflowRule.update({
      where: { id: rule.id },
      data: { condition: { status: "paid_full" } }
    });
    updated++;
  }

  console.info(
    `Reglas de agradecimiento: ${updated} con condición status=paid_full, ` +
      `${skipped} conservadas por tener condición propia.`
  );
}

main()
  .catch((error: unknown) => {
    console.error("Error al condicionar las reglas de agradecimiento:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
