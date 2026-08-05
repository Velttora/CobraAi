import type { PrismaService } from "@cobrai/db";
import { decimalToNumber } from "../common/utils/api.utils";

export interface UncontactedDebt {
  debtId: string;
  debtorId: string;
  debtorName: string;
  externalRef: string | null;
  amountOutstanding: number;
  currency: string;
  blockedChannel: string;
  blockedSince: string;
}

export interface UncontactedDebtsPage {
  items: UncontactedDebt[];
  total: number;
  page: number;
}

const DEBTS_EXCLUDED_FROM_UNCONTACTED = ["paid_full", "written_off"] as const;

/**
 * Debts blocked by `channel_not_configured` (D-16). Plan 08-05 deliberately
 * creates no `Contact` row for this block reason, so `audit_logs` — written by
 * `AuditService.logComplianceDecision` (`packages/compliance/src/audit.service.ts`,
 * `action: "compliance.contact.blocked"`, `changes.reason`) — is the only
 * durable record of it.
 *
 * Uses Prisma's native Postgres JSON `path`/`equals` filter for the
 * `changes->>'reason'` predicate rather than a raw `$queryRaw` — the JSON
 * predicate does not actually need raw SQL (Prisma's generated `JsonFilter`
 * supports it directly), which keeps every step typed and independently
 * unit-testable with mocked Prisma model methods, matching this service's
 * existing pagination precedent (`conversations.service.ts`). No
 * `$queryRawUnsafe` is used anywhere (T-08-14e).
 */
export async function queryUncontactedDebts(
  prisma: PrismaService,
  tenantId: string,
  page: number,
  pageSize: number
): Promise<UncontactedDebtsPage> {
  const latestBlockByDebtor = await latestChannelNotConfiguredBlocks(prisma, tenantId);
  if (latestBlockByDebtor.size === 0) {
    return { items: [], total: 0, page };
  }

  await excludeDebtorsContactedSinceBlock(prisma, tenantId, latestBlockByDebtor);
  if (latestBlockByDebtor.size === 0) {
    return { items: [], total: 0, page };
  }

  const rows = await debtsForBlockedDebtors(prisma, tenantId, latestBlockByDebtor);
  const total = rows.length;
  const offset = (page - 1) * pageSize;

  return { items: rows.slice(offset, offset + pageSize), total, page };
}

/** One entry per debtor: their single most recent `channel_not_configured` block, newest audit log wins. */
async function latestChannelNotConfiguredBlocks(
  prisma: PrismaService,
  tenantId: string
): Promise<Map<string, { channel: string; blockedSince: Date }>> {
  const blockLogs = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: "compliance.contact.blocked",
      changes: { path: ["reason"], equals: "channel_not_configured" },
      deletedAt: null
    },
    orderBy: { createdAt: "desc" },
    select: { resourceId: true, changes: true, createdAt: true }
  });

  const latest = new Map<string, { channel: string; blockedSince: Date }>();
  for (const log of blockLogs) {
    if (latest.has(log.resourceId)) continue; // already newer-first; first hit per debtor is the most recent
    const channel = (log.changes as { channel?: unknown } | null)?.channel;
    if (typeof channel !== "string") continue;
    latest.set(log.resourceId, { channel, blockedSince: log.createdAt });
  }
  return latest;
}

/** Mutates `latestBlockByDebtor`, removing any debtor with a completed contact on the blocked channel newer than the block. */
async function excludeDebtorsContactedSinceBlock(
  prisma: PrismaService,
  tenantId: string,
  latestBlockByDebtor: Map<string, { channel: string; blockedSince: Date }>
): Promise<void> {
  const contacts = await prisma.contact.findMany({
    where: {
      tenantId,
      debtorId: { in: [...latestBlockByDebtor.keys()] },
      status: "completed",
      deletedAt: null
    },
    select: { debtorId: true, channel: true, createdAt: true }
  });

  for (const contact of contacts) {
    const block = latestBlockByDebtor.get(contact.debtorId);
    if (block && contact.channel === block.channel && contact.createdAt > block.blockedSince) {
      latestBlockByDebtor.delete(contact.debtorId);
    }
  }
}

/** The surviving debtors' active debts (excluding fully paid / written off), newest block first. */
async function debtsForBlockedDebtors(
  prisma: PrismaService,
  tenantId: string,
  latestBlockByDebtor: Map<string, { channel: string; blockedSince: Date }>
): Promise<UncontactedDebt[]> {
  const debts = await prisma.debt.findMany({
    where: {
      tenantId,
      debtorId: { in: [...latestBlockByDebtor.keys()] },
      deletedAt: null,
      status: { notIn: [...DEBTS_EXCLUDED_FROM_UNCONTACTED] }
    },
    include: { debtor: { select: { id: true, name: true } } }
  });

  const rows = debts
    .map((debt): UncontactedDebt | null => {
      const block = latestBlockByDebtor.get(debt.debtorId);
      if (!block) return null;
      return {
        debtId: debt.id,
        debtorId: debt.debtorId,
        debtorName: debt.debtor.name,
        externalRef: debt.externalRef,
        amountOutstanding: decimalToNumber(debt.amountOutstanding),
        currency: debt.currency,
        blockedChannel: block.channel,
        blockedSince: block.blockedSince.toISOString()
      };
    })
    .filter((row): row is UncontactedDebt => row !== null);

  return rows.sort((a, b) => (a.blockedSince < b.blockedSince ? 1 : -1));
}
