import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import type { Debt, Debtor } from "@cobrai/db";
import type { AIScoringPort, ScoringResult } from "@cobrai/ports";
import { daysSinceLastContact, planOperationalScores } from "@cobrai/utils";
import { AI_SCORING_PORT } from "./stub-ai-scoring.adapter";
import { computeAgingDays, decimalToNumber } from "../common/utils/api.utils";

type ScoreContext = {
  maxAmountInPortfolio: number;
  daysSinceLastContact: number | null;
  promisesBrokenCount: number;
  previousContactsCount: number;
};

/**
 * Estados que se re-segmentan (recalcula priority_score, segmento y best_channel).
 * Incluye toda deuda aún en gestión; excluye solo las terminales (pagada total o
 * castigada), donde el canal sugerido ya no aplica.
 */
const SEGMENTABLE_DEBT_STATUSES = [
  "future",
  "upcoming",
  "new",
  "analyzing",
  "active",
  "contacted",
  "promised",
  "plan",
  "disputed",
  "legal_risk",
  "legal",
  "paid_partial"
] as const;

function debtorContactFlags(debtor: Debtor): {
  has_whatsapp: boolean;
  has_phone: boolean;
  has_email: boolean;
} {
  const phones = Array.isArray(debtor.phones) ? (debtor.phones as string[]) : [];
  return {
    has_whatsapp: debtor.whatsappOptIn,
    has_phone: phones.length > 0,
    has_email: Boolean(debtor.email?.trim())
  };
}

@Injectable()
export class ScoringService {
  constructor(
    @Inject(AI_SCORING_PORT) private readonly scoringPort: AIScoringPort,
    private readonly prisma: PrismaService
  ) {}

  async scoreDebtRecord(
    tenantId: string,
    debt: Debt,
    debtor: Debtor,
    context?: Partial<ScoreContext>
  ): Promise<ScoringResult> {
    const phones = Array.isArray(debtor.phones)
      ? (debtor.phones as string[])
      : [];
    const agingDays = computeAgingDays(debt.dueDate);

    const loaded = await this.loadScoreContext(
      tenantId,
      debt.portfolioId,
      debt.id
    );
    const resolved: ScoreContext = {
      maxAmountInPortfolio:
        context?.maxAmountInPortfolio ?? loaded.maxAmountInPortfolio,
      daysSinceLastContact:
        context?.daysSinceLastContact !== undefined
          ? context.daysSinceLastContact
          : loaded.daysSinceLastContact,
      promisesBrokenCount:
        context?.promisesBrokenCount ?? loaded.promisesBrokenCount,
      previousContactsCount:
        context?.previousContactsCount ?? loaded.previousContactsCount
    };

    return this.scoringPort.scoreDebt({
      debt_id: debt.id,
      tenant_id: tenantId,
      features: {
        aging_days: agingDays,
        amount: decimalToNumber(debt.amountOriginal),
        amount_outstanding: decimalToNumber(debt.amountOutstanding),
        has_whatsapp: debtor.whatsappOptIn,
        has_phone: phones.length > 0,
        has_email: Boolean(debtor.email),
        promises_broken_count: resolved.promisesBrokenCount,
        previous_contacts_count: resolved.previousContactsCount,
        days_since_last_contact: resolved.daysSinceLastContact,
        max_amount_in_portfolio: resolved.maxAmountInPortfolio,
        debt_status: debt.status
      }
    });
  }

  async loadScoreContext(
    tenantId: string,
    portfolioId: string,
    debtId: string
  ): Promise<ScoreContext> {
    const [maxAgg, lastContact, contactCount, brokenPromises] =
      await Promise.all([
        this.prisma.debt.aggregate({
          where: {
            tenantId,
            portfolioId,
            deletedAt: null,
            status: {
              notIn: [
                "paid_full",
                "paid_partial",
                "written_off",
                "future",
                "upcoming"
              ]
            }
          },
          _max: { amountOutstanding: true }
        }),
        this.prisma.contact.findFirst({
          where: { tenantId, debtId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        }),
        this.prisma.contact.count({
          where: { tenantId, debtId, deletedAt: null }
        }),
        this.prisma.promiseToPay.count({
          where: { tenantId, debtId, status: "broken", deletedAt: null }
        })
      ]);

    return {
      maxAmountInPortfolio: Math.max(
        decimalToNumber(maxAgg._max.amountOutstanding),
        1
      ),
      daysSinceLastContact: daysSinceLastContact(lastContact?.createdAt ?? null),
      promisesBrokenCount: brokenPromises,
      previousContactsCount: contactCount
    };
  }

  /**
   * Recalcula priority_score y segmento operativo sin cambiar ai_score existente.
   */
  async refreshPriorityScoresForTenant(tenantId: string): Promise<number> {
    const debts = await this.prisma.debt.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: [...SEGMENTABLE_DEBT_STATUSES] }
      },
      include: { debtor: true }
    });
    return this.updateOperationalScoresForDebts(tenantId, debts);
  }

  /** Tras editar datos de contacto del deudor, actualiza scores de sus deudas en gestión. */
  async refreshScoresForDebtor(
    tenantId: string,
    debtorId: string
  ): Promise<number> {
    const debts = await this.prisma.debt.findMany({
      where: {
        tenantId,
        debtorId,
        deletedAt: null,
        status: { in: [...SEGMENTABLE_DEBT_STATUSES] }
      },
      include: { debtor: true }
    });
    return this.updateOperationalScoresForDebts(tenantId, debts);
  }

  private async updateOperationalScoresForDebts(
    tenantId: string,
    debts: Array<Debt & { debtor: Debtor }>
  ): Promise<number> {
    if (debts.length === 0) return 0;

    const debtIds = debts.map((d) => d.id);

    const maxByPortfolio = new Map<string, number>();
    for (const debt of debts) {
      const amt = decimalToNumber(debt.amountOutstanding);
      maxByPortfolio.set(
        debt.portfolioId,
        Math.max(maxByPortfolio.get(debt.portfolioId) ?? 0, amt)
      );
    }

    const lastContacts = await this.prisma.contact.groupBy({
      by: ["debtId"],
      where: { tenantId, debtId: { in: debtIds }, deletedAt: null },
      _max: { createdAt: true }
    });
    const lastContactByDebt = new Map(
      lastContacts.map((row) => [row.debtId, row._max.createdAt ?? null])
    );

    const contactCounts = await this.prisma.contact.groupBy({
      by: ["debtId"],
      where: { tenantId, debtId: { in: debtIds }, deletedAt: null },
      _count: { _all: true }
    });
    const contactCountByDebt = new Map(
      contactCounts.map((row) => [row.debtId, row._count._all])
    );

    const brokenByDebt = await this.prisma.promiseToPay.groupBy({
      by: ["debtId"],
      where: {
        tenantId,
        debtId: { in: debtIds },
        status: "broken",
        deletedAt: null
      },
      _count: { _all: true }
    });
    const brokenCountByDebt = new Map(
      brokenByDebt.map((row) => [row.debtId, row._count._all])
    );

    for (const debt of debts) {
      const recoveryScore =
        debt.aiScore ??
        (
          await this.scoreDebtRecord(tenantId, debt, debt.debtor, {
            maxAmountInPortfolio: maxByPortfolio.get(debt.portfolioId) ?? 1,
            daysSinceLastContact: daysSinceLastContact(
              lastContactByDebt.get(debt.id) ?? null
            ),
            promisesBrokenCount: brokenCountByDebt.get(debt.id) ?? 0,
            previousContactsCount: contactCountByDebt.get(debt.id) ?? 0
          })
        ).score;

      const contact = debtorContactFlags(debt.debtor);
      const operational = planOperationalScores({
        recovery_score: recoveryScore,
        amount_outstanding: decimalToNumber(debt.amountOutstanding),
        days_since_last_contact: daysSinceLastContact(
          lastContactByDebt.get(debt.id) ?? null
        ),
        max_amount_in_portfolio: maxByPortfolio.get(debt.portfolioId) ?? 1,
        aging_days: computeAgingDays(debt.dueDate),
        debt_status: debt.status,
        has_whatsapp: contact.has_whatsapp,
        has_phone: contact.has_phone,
        has_email: contact.has_email
      });

      await this.prisma.debt.update({
        where: { id: debt.id },
        data: {
          ...(debt.aiScore == null ? { aiScore: recoveryScore } : {}),
          priorityScore: operational.priority_score,
          aiSegment: operational.segment,
          riskLevel: operational.segment,
          bestChannel: operational.best_channel
        }
      });
    }

    return debts.length;
  }
}
