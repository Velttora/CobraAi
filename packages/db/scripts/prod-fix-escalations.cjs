/**
 * Aplica migración `internal` + backfill de escalaciones en Fly.
 * Uso: ver infra/fly/run-prod-db-fix.sh
 */
const { PrismaClient } = require("@prisma/client");

const MIGRATION_NAME = "20260610230000_add_internal_contact_channel";
const MIGRATION_CHECKSUM =
  "a26cc66f10c29b65a90f29a945e8770d2a409325ce1dd1d50b15fc683b486e36";

const prisma = new PrismaClient();

function systemContent(ruleName) {
  return JSON.stringify({
    text: `Escalado automáticamente por regla: "${ruleName}". Requiere atención humana.`,
    system_event: "workflow_escalation"
  });
}

async function ensureInternalChannel() {
  const existing = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION_NAME}'`
  );
  if (Array.isArray(existing) && existing.length > 0) {
    console.log(`Migración ${MIGRATION_NAME} ya aplicada.`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `ALTER TYPE "contact_channel" ADD VALUE IF NOT EXISTS 'internal'`
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES (gen_random_uuid(), '${MIGRATION_CHECKSUM}', NOW(), '${MIGRATION_NAME}', NULL, NULL, NOW(), 1)`
  );
  console.log(`Migración ${MIGRATION_NAME} aplicada.`);
}

async function escalateDebtFromExecution({ tenantId, debtId, ruleName, executedAt }) {
  const existing = await prisma.conversation.findFirst({
    where: {
      tenantId,
      debtId,
      deletedAt: null,
      status: { notIn: ["closed", "archived"] }
    },
    orderBy: { lastMessageAt: "desc" }
  });

  const content = systemContent(ruleName);

  if (existing) {
    if (existing.status === "escalated") return "skipped";

    await prisma.conversation.update({
      where: { id: existing.id },
      data: { status: "escalated", lastMessageAt: executedAt }
    });
    await prisma.message.create({
      data: {
        tenantId,
        conversationId: existing.id,
        direction: "out",
        channel: existing.channel,
        content,
        status: "sent",
        sentAt: executedAt
      }
    });
    return "updated";
  }

  const debt = await prisma.debt.findFirst({
    where: { id: debtId, tenantId, deletedAt: null },
    select: { debtorId: true }
  });
  if (!debt) return "skipped";

  const conv = await prisma.conversation.create({
    data: {
      tenantId,
      debtorId: debt.debtorId,
      debtId,
      channel: "internal",
      status: "escalated",
      lastMessageAt: executedAt
    }
  });
  await prisma.message.create({
    data: {
      tenantId,
      conversationId: conv.id,
      direction: "out",
      channel: "internal",
      content,
      status: "sent",
      sentAt: executedAt
    }
  });
  return "created";
}

async function backfillEscalations() {
  const executions = await prisma.workflowExecution.findMany({
    where: { deletedAt: null, rule: { action: "escalate_human" } },
    orderBy: { createdAt: "asc" },
    select: {
      tenantId: true,
      debtId: true,
      createdAt: true,
      rule: { select: { name: true } }
    }
  });

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const seenDebts = new Set();

  for (const execution of executions) {
    const key = `${execution.tenantId}:${execution.debtId}`;
    if (seenDebts.has(key)) {
      skipped++;
      continue;
    }
    seenDebts.add(key);

    const result = await escalateDebtFromExecution({
      tenantId: execution.tenantId,
      debtId: execution.debtId,
      ruleName: execution.rule.name,
      executedAt: execution.createdAt
    });

    if (result === "updated") updated++;
    else if (result === "created") created++;
    else skipped++;
  }

  const escalatedCount = await prisma.conversation.count({
    where: { status: "escalated", deletedAt: null }
  });

  console.log(
    `Backfill: ${executions.length} ejecuciones → ${created} creadas, ${updated} actualizadas, ${skipped} omitidas. Bandeja: ${escalatedCount}.`
  );
}

async function main() {
  await ensureInternalChannel();
  await backfillEscalations();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
