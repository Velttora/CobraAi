import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import type { Debt, Prisma } from "@cobrai/db";
import { KafkaService } from "../kafka/kafka.service";
import { ScoringService } from "../ai-scoring/scoring.service";
import { DebtorsService } from "../debtors/debtors.service";
import {
  getCollectionQuarter,
  getInitialDebtStatus,
  getQuarterDateRange
} from "@cobrai/utils";
import {
  attachLastContactResponse,
  computeAgingBucket,
  computeAgingDays,
  decimalToNumber,
  parseFilters,
  parsePagination,
  parseSort
} from "../common/utils/api.utils";
import type { BulkCreateDebtsDto, CreateDebtDto, UpdateDebtDto } from "./dto/debt.dto";

@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debtorsService: DebtorsService,
    private readonly scoringService: ScoringService,
    private readonly kafka: KafkaService
  ) {}

  async list(tenantId: string, query: Record<string, unknown>) {
    const { page, limit, skip } = parsePagination(query);
    const filters = parseFilters(query);
    const { field, direction } = parseSort(
      query.sort,
      ["created_at", "due_date", "ai_score", "priority_score", "amount_outstanding"],
      "priority_score"
    );

    const orderByMap: Record<string, Prisma.DebtOrderByWithRelationInput> = {
      created_at: { createdAt: direction },
      due_date: { dueDate: direction },
      ai_score: { aiScore: direction },
      priority_score: { priorityScore: direction },
      amount_outstanding: { amountOutstanding: direction }
    };

    const includeFuture =
      query.include_future === "true" || query.include_future === true;
    const pipelineOnly =
      query.pipeline === "future" || filters.status === "future,upcoming";

    const where: Prisma.DebtWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.status && !pipelineOnly
        ? { status: filters.status as never }
        : {}),
      ...(pipelineOnly
        ? { status: { in: ["future", "upcoming"] } }
        : !includeFuture
          ? { status: { notIn: ["future", "upcoming"] } }
          : {}),
      ...(filters.collection_quarter
        ? this.collectionQuarterFilter(filters.collection_quarter)
        : {}),
      ...(filters.aging_bucket ? { agingBucket: filters.aging_bucket as never } : {}),
      ...(filters.ai_segment ? { aiSegment: filters.ai_segment as never } : {}),
      ...(filters.ai_score ? { aiScore: Number(filters.ai_score) } : {}),
      ...(filters.portfolio_id ? { portfolioId: filters.portfolio_id } : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.debt.findMany({
        where,
        skip,
        take: limit,
        orderBy: orderByMap[field] ?? { createdAt: "desc" },
        include: { debtor: true, portfolio: true }
      }),
      this.prisma.debt.count({ where })
    ]);

    const itemsWithResponseStatus = await attachLastContactResponse(
      this.prisma,
      tenantId,
      items
    );

    return { items: itemsWithResponseStatus, total, page, limit };
  }

  async create(tenantId: string, dto: CreateDebtDto): Promise<Debt> {
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: dto.portfolio_id, tenantId, deletedAt: null }
    });
    if (!portfolio) {
      throw new NotFoundException("Portafolio no encontrado");
    }

    const debtor = await this.debtorsService.upsertForDebt(tenantId, {
      name: dto.debtor.name,
      external_ref: dto.debtor.external_ref,
      debtor_type: dto.debtor.debtor_type,
      debtor_tax_id: dto.debtor.debtor_tax_id,
      phones: dto.debtor.phones,
      debtor_email: dto.debtor.debtor_email,
      whatsapp_opt_in: dto.debtor.whatsapp_opt_in
    });

    const dueDate = new Date(dto.due_date);
    const scheduledDate = dto.scheduled_collection_date
      ? new Date(dto.scheduled_collection_date)
      : undefined;
    const invoiceDate = dto.invoice_date ? new Date(dto.invoice_date) : undefined;

    if (invoiceDate && invoiceDate > dueDate) {
      throw new BadRequestException("invoice_date no puede ser posterior a due_date");
    }

    const { status, agingBucket } = getInitialDebtStatus(dueDate, scheduledDate);
    const collectionQuarter = getCollectionQuarter(scheduledDate ?? dueDate);

    let debt = await this.prisma.debt.create({
      data: {
        tenantId,
        portfolioId: dto.portfolio_id,
        debtorId: debtor.id,
        externalRef: dto.external_ref,
        amountOriginal: dto.amount,
        amountOutstanding: dto.amount,
        currency: dto.currency,
        dueDate,
        scheduledCollectionDate: scheduledDate,
        paymentTermsDays: dto.payment_terms_days,
        collectionQuarter,
        invoiceDate,
        agingBucket: agingBucket as never,
        status: status as never,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue
      }
    });

    await this.refreshPortfolioTotals(tenantId, dto.portfolio_id);

    if (status === "future" || status === "upcoming") {
      return debt;
    }

    await this.kafka.publish("cobrai.debt.created", tenantId, {
      debt_id: debt.id,
      portfolio_id: debt.portfolioId,
      debtor_id: debt.debtorId,
      status: debt.status,
      due_date: dueDate.toISOString()
    });

    if (status === "new") {
      debt = await this.prisma.debt.update({
        where: { id: debt.id },
        data: { status: "analyzing" }
      });
    }

    const scoring = await this.scoringService.scoreDebtRecord(
      tenantId,
      debt,
      debtor
    );

    debt = await this.prisma.debt.update({
      where: { id: debt.id },
      data: {
        aiScore: scoring.score,
        priorityScore: scoring.priority_score,
        aiSegment: scoring.segment,
        riskLevel: scoring.risk_level,
        bestChannel: scoring.best_channel,
        status: "active"
      }
    });

    await this.kafka.publish("cobrai.debt.segmented", tenantId, {
      debt_id: debt.id,
      portfolio_id: debt.portfolioId,
      debtor_id: debt.debtorId,
      ai_score: scoring.score,
      ai_segment: scoring.segment,
      best_channel: scoring.best_channel
    });

    return debt;
  }

  async bulkCreate(tenantId: string, dto: BulkCreateDebtsDto) {
    if (dto.items.length > 500) {
      throw new BadRequestException("Máximo 500 deudas por request");
    }
    const created = [];
    for (const item of dto.items) {
      created.push(await this.create(tenantId, item));
    }
    return created;
  }

  async findOne(tenantId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { debtor: true, portfolio: true }
    });
    if (!debt) {
      throw new NotFoundException("Deuda no encontrada");
    }
    const [withResponseStatus] = await attachLastContactResponse(this.prisma, tenantId, [debt]);
    return withResponseStatus!;
  }

  async update(tenantId: string, id: string, dto: UpdateDebtDto) {
    const existing = await this.findOne(tenantId, id);
    const debt = await this.prisma.debt.update({
      where: { id },
      data: {
        status: dto.status as never,
        amountOutstanding: dto.amount_outstanding,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined
      }
    });

    await this.kafka.publish("cobrai.debt.updated", tenantId, {
      debt_id: debt.id,
      status: debt.status,
      amount_outstanding: decimalToNumber(debt.amountOutstanding)
    });

    if (dto.amount_outstanding !== undefined) {
      await this.refreshPortfolioTotals(tenantId, existing.portfolioId);
    }

    return debt;
  }

  async timeline(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    const [contacts, promises, payments, executions] = await Promise.all([
      this.prisma.contact.findMany({
        where: { tenantId, debtId: id, deletedAt: null },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.promiseToPay.findMany({
        where: { tenantId, debtId: id, deletedAt: null },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.payment.findMany({
        where: { tenantId, debtId: id, deletedAt: null },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.workflowExecution.findMany({
        where: { tenantId, debtId: id, deletedAt: null },
        orderBy: { createdAt: "desc" }
      })
    ]);

    const events = [
      ...contacts.map((c) => ({
        type: "contact",
        at: c.startedAt ?? c.createdAt,
        data: c
      })),
      ...promises.map((p) => ({ type: "promise", at: p.createdAt, data: p })),
      ...payments.map((p) => ({ type: "payment", at: p.createdAt, data: p })),
      ...executions.map((e) => ({
        type: "workflow",
        at: e.executedAt ?? e.createdAt,
        data: e
      }))
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return events;
  }

  async resegment(tenantId: string, id: string) {
    const debt = await this.findOne(tenantId, id);
    const debtor = await this.debtorsService.findOne(tenantId, debt.debtorId);
    const scoring = await this.scoringService.scoreDebtRecord(
      tenantId,
      debt,
      debtor
    );
    return this.prisma.debt.update({
      where: { id },
      data: {
        aiScore: scoring.score,
        priorityScore: scoring.priority_score,
        aiSegment: scoring.segment,
        riskLevel: scoring.risk_level,
        bestChannel: scoring.best_channel
      }
    }).then(async (updated) => {
      await this.kafka.publish("cobrai.debt.segmented", tenantId, {
        debt_id: updated.id,
        ai_score: scoring.score,
        priority_score: scoring.priority_score,
        ai_segment: scoring.segment,
        best_channel: scoring.best_channel
      });
      return updated;
    });
  }

  /** Alineado con stats: quarter guardado o fecha de cobro programada / vencimiento. */
  private collectionQuarterFilter(quarter: string): Prisma.DebtWhereInput {
    const { start, end } = getQuarterDateRange(quarter);
    return {
      OR: [
        { collectionQuarter: quarter },
        {
          collectionQuarter: null,
          OR: [
            { scheduledCollectionDate: { gte: start, lte: end } },
            {
              scheduledCollectionDate: null,
              dueDate: { gte: start, lte: end }
            }
          ]
        }
      ]
    };
  }

  private async refreshPortfolioTotals(
    tenantId: string,
    portfolioId: string
  ): Promise<void> {
    const agg = await this.prisma.debt.aggregate({
      where: { tenantId, portfolioId, deletedAt: null },
      _count: { _all: true },
      _sum: { amountOutstanding: true }
    });
    await this.prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        totalDebts: agg._count._all,
        totalAmount: agg._sum.amountOutstanding ?? 0
      }
    });
  }
}
