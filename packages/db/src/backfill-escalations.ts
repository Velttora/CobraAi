import {
  ContactChannel,
  ConversationStatus,
  PrismaClient
} from "@prisma/client";
import { loadSeedEnv } from "./load-seed-env";

const prisma = new PrismaClient();

function systemContent(ruleName: string): string {
  return JSON.stringify({
    text: `Escalado automáticamente por regla: "${ruleName}". Requiere atención humana.`,
    system_event: "workflow_escalation"
  });
}

async function escalateDebtFromExecution(input: {
  tenantId: string;
  debtId: string;
  ruleName: string;
  executedAt: Date;
}): Promise<"updated" | "created" | "skipped"> {
  const { tenantId, debtId, ruleName, executedAt } = input;

  const existing = await prisma.conversation.findFirst({
    where: {
      tenantId,
      debtId,
      deletedAt: null,
      status: { notIn: [ConversationStatus.closed, ConversationStatus.archived] }
    },
    orderBy: { lastMessageAt: "desc" }
  });

  const content = systemContent(ruleName);

  if (existing) {
    if (existing.status === ConversationStatus.escalated) {
      return "skipped";
    }

    await prisma.conversation.update({
      where: { id: existing.id },
      data: {
        status: ConversationStatus.escalated,
        lastMessageAt: executedAt
      }
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
      channel: ContactChannel.internal,
      status: ConversationStatus.escalated,
      lastMessageAt: executedAt
    }
  });
  await prisma.message.create({
    data: {
      tenantId,
      conversationId: conv.id,
      direction: "out",
      channel: ContactChannel.internal,
      content,
      status: "sent",
      sentAt: executedAt
    }
  });
  return "created";
}

async function main(): Promise<void> {
  loadSeedEnv();

  const executions = await prisma.workflowExecution.findMany({
    where: {
      deletedAt: null,
      rule: { action: "escalate_human" }
    },
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
  const seenDebts = new Set<string>();

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
    where: { status: ConversationStatus.escalated, deletedAt: null }
  });

  console.info(
    `Escalaciones: ${executions.length} ejecuciones procesadas → ` +
      `${created} conversaciones creadas, ${updated} actualizadas, ${skipped} omitidas. ` +
      `Total en bandeja (escalated): ${escalatedCount}.`
  );
}

main()
  .catch((error: unknown) => {
    console.error("Error al rellenar escalaciones:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
