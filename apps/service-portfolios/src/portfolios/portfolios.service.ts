import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ensureTenantRecord, PrismaService } from "@cobrai/db";
import type { Portfolio, WorkflowRule } from "@cobrai/db";
import {
  applyPackageToPortfolio,
  countActivePortfolioRules,
  deactivatePortfolioRules,
  resolveAppliedById
} from "@cobrai/workflow-packages";
import {
  getCollectionQuarter,
  getQuarterLabel,
  getQuarterPipelineStatus,
  isActiveDebt
} from "@cobrai/utils";
import {
  decimalToNumber,
  parseFilters,
  parsePagination,
  parseSort
} from "../common/utils/api.utils";
import type {
  CreatePortfolioDto,
  UpdatePortfolioDto,
  UpdatePortfolioStrategyDto
} from "./dto/portfolio.dto";

type PortfolioListItem = Portfolio & { rulesCount: number };

@Injectable()
export class PortfoliosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    query: Record<string, unknown>
  ): Promise<{
    items: PortfolioListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page, limit, skip } = parsePagination(query);
    const filters = parseFilters(query);
    const { field, direction } = parseSort(query.sort, [
      "created_at",
      "name",
      "total_amount"
    ]);

    const orderBy =
      field === "created_at"
        ? { createdAt: direction }
        : field === "name"
          ? { name: direction }
          : { totalAmount: direction };

    const where = {
      tenantId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status as never } : {})
    };

    const [items, total, ruleCounts] = await Promise.all([
      this.prisma.portfolio.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.portfolio.count({ where }),
      this.prisma.workflowRule.groupBy({
        by: ["portfolioId"],
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
          portfolioId: { not: null }
        },
        _count: { _all: true }
      })
    ]);

    const countByPortfolio = new Map(
      ruleCounts.map((row) => [row.portfolioId!, row._count._all])
    );

    return {
      items: items.map((item) => ({
        ...item,
        rulesCount: countByPortfolio.get(item.id) ?? 0
      })),
      total,
      page,
      limit
    };
  }

  async create(
    tenantId: string,
    dto: CreatePortfolioDto,
    userId?: string
  ): Promise<Portfolio & { workflowRules?: WorkflowRule[] }> {
    await ensureTenantRecord(this.prisma, tenantId);
    const appliedById = await resolveAppliedById(this.prisma, userId);

    const portfolio = await this.prisma.portfolio.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        currency: dto.currency ?? "COP",
        automationStatus:
          dto.strategy === "custom"
            ? "custom"
            : dto.strategy === "package"
              ? "package"
              : "none"
      }
    });

    if (dto.strategy === "package" && dto.package_slug) {
      try {
        await applyPackageToPortfolio(this.prisma, {
          tenantId,
          portfolioId: portfolio.id,
          packageId: dto.package_slug,
          overwrite: true,
          appliedById
        });
      } catch (error) {
        const err = error as Error & { code?: string };
        if (err.code === "PACKAGE_ALREADY_APPLIED") {
          throw new ConflictException(
            "Este portafolio ya tiene reglas activas. Usa sobrescribir para aplicar el paquete."
          );
        }
        if (err.message.includes("no encontrado")) {
          throw new BadRequestException(err.message);
        }
        throw error;
      }
    } else if (dto.strategy === "custom") {
      await this.prisma.portfolioPackageApplication.create({
        data: {
          tenantId,
          portfolioId: portfolio.id,
          action: "custom",
          appliedById
        }
      });
    }

    return this.findOne(tenantId, portfolio.id);
  }

  async findOne(
    tenantId: string,
    id: string
  ): Promise<
    Portfolio & {
      rulesCount: number;
      workflowRules: WorkflowRule[];
      packageApplications: unknown[];
    }
  > {
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        workflowRules: {
          where: { deletedAt: null },
          orderBy: [{ isActive: "desc" }, { priority: "asc" }]
        },
        packageApplications: {
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    });
    if (!portfolio) {
      throw new NotFoundException("Portafolio no encontrado");
    }

    const rulesCount = portfolio.workflowRules.filter((r) => r.isActive).length;
    return { ...portfolio, rulesCount };
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePortfolioDto
  ): Promise<Portfolio> {
    await this.findOne(tenantId, id);
    return this.prisma.portfolio.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status
      }
    });
  }

  async updateStrategy(
    tenantId: string,
    id: string,
    dto: UpdatePortfolioStrategyDto,
    userId?: string
  ): Promise<Record<string, unknown>> {
    const portfolio = await this.findOne(tenantId, id);
    const appliedById = await resolveAppliedById(this.prisma, userId);

    if (dto.strategy === "none") {
      await deactivatePortfolioRules(this.prisma, tenantId, id);
      await this.prisma.portfolio.update({
        where: { id },
        data: { automationStatus: "none", activePackageSlug: null }
      });
      await this.prisma.portfolioPackageApplication.create({
        data: {
          tenantId,
          portfolioId: id,
          packageSlug: portfolio.activePackageSlug,
          action: "deactivated",
          appliedById
        }
      });
      return {
        automation_status: "none",
        active_package_slug: null,
        confirm_required: false
      };
    }

    if (dto.strategy === "custom") {
      await this.prisma.portfolio.update({
        where: { id },
        data: { automationStatus: "custom" }
      });
      await this.prisma.portfolioPackageApplication.create({
        data: {
          tenantId,
          portfolioId: id,
          packageSlug: portfolio.activePackageSlug,
          action: "custom",
          appliedById
        }
      });
      const updated = await this.findOne(tenantId, id);
      return { ...updated, confirm_required: false };
    }

    if (dto.strategy === "package") {
      if (!dto.package_slug) {
        throw new BadRequestException("package_slug es requerido");
      }

      const existingCount = await countActivePortfolioRules(
        this.prisma,
        tenantId,
        id
      );

      if (existingCount > 0 && !dto.overwrite) {
        return {
          confirm_required: true,
          existing_count: existingCount,
          package_id: dto.package_slug,
          automation_status: portfolio.automationStatus,
          active_package_slug: portfolio.activePackageSlug
        };
      }

      const result = await this.applyPackageStrategy(
        tenantId,
        id,
        dto.package_slug,
        dto.overwrite ?? false,
        appliedById,
        portfolio.activePackageSlug
      );

      const updated = await this.findOne(tenantId, id);
      return {
        ...updated,
        confirm_required: false,
        rules_created: result.rules_created,
        rules_replaced: result.rules_replaced
      };
    }

    throw new BadRequestException("Estrategia inválida");
  }

  private async applyPackageStrategy(
    tenantId: string,
    portfolioId: string,
    packageId: string,
    overwrite: boolean,
    appliedById: string | undefined,
    previousPackageSlug: string | null
  ) {
    try {
      return await applyPackageToPortfolio(this.prisma, {
        tenantId,
        portfolioId,
        packageId,
        overwrite,
        appliedById,
        previousPackageSlug
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error as Error & { code?: string }).code === "PACKAGE_ALREADY_APPLIED"
      ) {
        const err = error as Error & {
          package_id: string;
          existing_count: number;
        };
        throw new ConflictException({
          code: "PACKAGE_ALREADY_APPLIED",
          message:
            "Este portafolio ya tiene reglas activas. Confirma si deseas reemplazarlas.",
          package_id: err.package_id,
          existing_count: err.existing_count
        });
      }
      if (error instanceof Error && error.message.includes("no encontrado")) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  async softDelete(tenantId: string, id: string): Promise<Portfolio> {
    await this.findOne(tenantId, id);
    return this.prisma.portfolio.update({
      where: { id },
      data: { deletedAt: new Date(), status: "archived" }
    });
  }

  async stats(tenantId: string, id: string): Promise<Record<string, unknown>> {
    await this.findOne(tenantId, id);

    const debts = await this.prisma.debt.findMany({
      where: { tenantId, portfolioId: id, deletedAt: null },
      select: {
        status: true,
        agingBucket: true,
        amountOriginal: true,
        amountOutstanding: true,
        collectionQuarter: true,
        dueDate: true,
        scheduledCollectionDate: true
      }
    });

    const activeDebts = debts.filter((d) => isActiveDebt(d.status));
    const totalActiveAmount = activeDebts.reduce(
      (sum, d) => sum + decimalToNumber(d.amountOutstanding),
      0
    );
    const totalPortfolioAmount = debts.reduce(
      (sum, d) => sum + decimalToNumber(d.amountOriginal),
      0
    );

    const recoveredAmount = debts
      .filter((d) => d.status === "paid_full" || d.status === "paid_partial")
      .reduce((sum, d) => sum + decimalToNumber(d.amountOriginal), 0);

    const collectableOriginal = activeDebts.reduce(
      (sum, d) => sum + decimalToNumber(d.amountOriginal),
      0
    );
    const recoveryRate =
      collectableOriginal > 0 ? recoveredAmount / collectableOriginal : 0;

    const overdueActive = activeDebts.filter(
      (d) => !["future", "upcoming"].includes(d.status)
    );
    const dsoAverage =
      overdueActive.length > 0
        ? overdueActive.reduce((sum, d) => {
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            const due = new Date(d.dueDate);
            due.setUTCHours(0, 0, 0, 0);
            const days = Math.max(
              0,
              Math.floor((today.getTime() - due.getTime()) / 86_400_000)
            );
            return sum + days;
          }, 0) / overdueActive.length
        : 0;

    const quarterMap = new Map<
      string,
      {
        statuses: string[];
        amount: number;
        debts_count: number;
        recovered: number;
        aging: Record<string, number>;
      }
    >();

    for (const debt of debts) {
      const quarter =
        debt.collectionQuarter ??
        getCollectionQuarter(debt.scheduledCollectionDate ?? debt.dueDate);
      const entry = quarterMap.get(quarter) ?? {
        statuses: [],
        amount: 0,
        debts_count: 0,
        recovered: 0,
        aging: {}
      };
      entry.statuses.push(debt.status);
      entry.amount += decimalToNumber(debt.amountOriginal);
      entry.debts_count += 1;
      if (debt.status === "paid_full" || debt.status === "paid_partial") {
        entry.recovered += decimalToNumber(debt.amountOriginal);
      }
      if (isActiveDebt(debt.status) && debt.agingBucket) {
        entry.aging[debt.agingBucket] =
          (entry.aging[debt.agingBucket] ?? 0) + 1;
      }
      quarterMap.set(quarter, entry);
    }

    const quarters = [...quarterMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([quarter, data]) => {
        const pipelineStatus = getQuarterPipelineStatus(
          data.statuses as never[]
        );
        const quarterRecovery =
          data.amount > 0 ? data.recovered / data.amount : 0;
        return {
          quarter,
          label: getQuarterLabel(quarter),
          amount: data.amount,
          debts_count: data.debts_count,
          status: pipelineStatus,
          recovered: data.recovered,
          recovery_rate: quarterRecovery,
          aging_summary:
            pipelineStatus === "active" ? data.aging : null
        };
      });

    return {
      portfolio_id: id,
      total_active_amount: totalActiveAmount,
      total_active_debts: activeDebts.length,
      recovery_rate: recoveryRate,
      dso_average: Math.round(dsoAverage),
      recovered_amount: recoveredAmount,
      total_portfolio_amount: totalPortfolioAmount,
      total_portfolio_debts: debts.length,
      quarters,
      by_aging: Object.entries(
        activeDebts.reduce<Record<string, number>>((acc, d) => {
          acc[d.agingBucket] = (acc[d.agingBucket] ?? 0) + 1;
          return acc;
        }, {})
      ).map(([bucket, count]) => ({ bucket, count }))
    };
  }
}
