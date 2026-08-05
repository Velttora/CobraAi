import type { PrismaService } from "@cobrai/db";

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

/**
 * Placeholder — filled in by Task 3 (health summary + `channel_not_configured`
 * blocked-debts query). Task 1 references this module ahead of Task 3's
 * sequencing so `IntegrationsService.uncontactedDebts` compiles from the
 * start, mirroring 08-03-SUMMARY.md's stub-then-implement precedent.
 */
export async function queryUncontactedDebts(
  _prisma: PrismaService,
  _tenantId: string,
  page: number,
  _pageSize: number
): Promise<UncontactedDebtsPage> {
  return { items: [], total: 0, page };
}
