import type { Prisma, PrismaClient } from "@prisma/client";
import { getWorkflowPackageDefinition } from "./registry";
import {
  PACKAGE_SOURCE_KEY,
  type ApplyPackageResult,
  type WorkflowPackageDefinition
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Omite appliedById si el usuario no existe (p. ej. Clerk aún no sincronizado). */
export async function resolveAppliedById(
  prisma: DbClient,
  userId?: string | null
): Promise<string | undefined> {
  const trimmed = userId?.trim();
  if (!trimmed) {
    return undefined;
  }

  const user = await prisma.user.findUnique({
    where: { id: trimmed },
    select: { id: true }
  });
  return user?.id;
}

function portfolioPackageRuleWhere(
  tenantId: string,
  portfolioId: string,
  packageId: string
) {
  return {
    tenantId,
    portfolioId,
    deletedAt: null,
    condition: {
      path: [PACKAGE_SOURCE_KEY],
      equals: packageId
    }
  };
}

function tenantPackageRuleWhere(tenantId: string, packageId: string) {
  return {
    tenantId,
    portfolioId: null,
    deletedAt: null,
    condition: {
      path: [PACKAGE_SOURCE_KEY],
      equals: packageId
    }
  };
}

function buildRuleRows(
  pkg: WorkflowPackageDefinition,
  tenantId: string,
  portfolioId?: string
): Prisma.WorkflowRuleCreateManyInput[] {
  return pkg.rules.map((rule) => ({
    tenantId,
    portfolioId: portfolioId ?? null,
    name: rule.name,
    trigger: rule.trigger as never,
    condition: {
      ...rule.condition,
      [PACKAGE_SOURCE_KEY]: pkg.id
    } as Prisma.InputJsonValue,
    action: rule.action as never,
    channel: rule.channel as never,
    delayHours: rule.delay_hours ?? 0,
    priority: rule.priority ?? 100,
    isActive: true
  }));
}

export async function countPortfolioPackageRules(
  prisma: DbClient,
  tenantId: string,
  portfolioId: string,
  packageId: string
): Promise<number> {
  return prisma.workflowRule.count({
    where: portfolioPackageRuleWhere(tenantId, portfolioId, packageId)
  });
}

export async function countActivePortfolioRules(
  prisma: DbClient,
  tenantId: string,
  portfolioId: string
): Promise<number> {
  return prisma.workflowRule.count({
    where: {
      tenantId,
      portfolioId,
      deletedAt: null,
      isActive: true
    }
  });
}

export async function deactivatePortfolioRules(
  prisma: DbClient,
  tenantId: string,
  portfolioId: string
): Promise<number> {
  const result = await prisma.workflowRule.updateMany({
    where: {
      tenantId,
      portfolioId,
      deletedAt: null,
      isActive: true
    },
    data: { isActive: false, deletedAt: new Date() }
  });
  return result.count;
}

export async function applyPackageToTenant(
  prisma: DbClient,
  tenantId: string,
  packageId: string,
  overwrite = false
): Promise<ApplyPackageResult> {
  const pkg = getWorkflowPackageDefinition(packageId);
  if (!pkg) {
    throw new Error(`Paquete '${packageId}' no encontrado`);
  }

  const existingCount = await prisma.workflowRule.count({
    where: tenantPackageRuleWhere(tenantId, packageId)
  });

  if (existingCount > 0 && !overwrite) {
    const error = new Error("PACKAGE_ALREADY_APPLIED") as Error & {
      code: string;
      package_id: string;
      existing_count: number;
    };
    error.code = "PACKAGE_ALREADY_APPLIED";
    error.package_id = packageId;
    error.existing_count = existingCount;
    throw error;
  }

  let rulesReplaced = 0;

  if (existingCount > 0 && overwrite) {
    const replaced = await prisma.workflowRule.updateMany({
      where: tenantPackageRuleWhere(tenantId, packageId),
      data: { isActive: false, deletedAt: new Date() }
    });
    rulesReplaced = replaced.count;
  }

  await prisma.workflowRule.createMany({
    data: buildRuleRows(pkg, tenantId)
  });

  return {
    package_id: packageId,
    rules_created: pkg.rules.length,
    rules_replaced: rulesReplaced
  };
}

export async function applyPackageToPortfolio(
  prisma: DbClient,
  params: {
    tenantId: string;
    portfolioId: string;
    packageId: string;
    overwrite?: boolean;
    appliedById?: string;
    previousPackageSlug?: string | null;
  }
): Promise<ApplyPackageResult> {
  const {
    tenantId,
    portfolioId,
    packageId,
    overwrite = false,
    appliedById: rawAppliedById,
    previousPackageSlug
  } = params;

  const appliedById = await resolveAppliedById(prisma, rawAppliedById);

  const pkg = getWorkflowPackageDefinition(packageId);
  if (!pkg) {
    throw new Error(`Paquete '${packageId}' no encontrado`);
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, tenantId, deletedAt: null }
  });
  if (!portfolio) {
    throw new Error("Portafolio no encontrado");
  }

  const existingActiveCount = await countActivePortfolioRules(
    prisma,
    tenantId,
    portfolioId
  );

  if (existingActiveCount > 0 && !overwrite) {
    const error = new Error("PACKAGE_ALREADY_APPLIED") as Error & {
      code: string;
      package_id: string;
      existing_count: number;
    };
    error.code = "PACKAGE_ALREADY_APPLIED";
    error.package_id = packageId;
    error.existing_count = existingActiveCount;
    throw error;
  }

  const rulesReplaced = await deactivatePortfolioRules(
    prisma,
    tenantId,
    portfolioId
  );

  await prisma.workflowRule.createMany({
    data: buildRuleRows(pkg, tenantId, portfolioId)
  });

  await prisma.portfolio.update({
    where: { id: portfolioId },
    data: {
      automationStatus: "package",
      activePackageSlug: packageId
    }
  });

  if (previousPackageSlug && previousPackageSlug !== packageId) {
    await prisma.portfolioPackageApplication.create({
      data: {
        tenantId,
        portfolioId,
        packageSlug: previousPackageSlug,
        action: "replaced",
        appliedById,
        metadata: { replaced_by: packageId }
      }
    });
  }

  await prisma.portfolioPackageApplication.create({
    data: {
      tenantId,
      portfolioId,
      packageSlug: packageId,
      action: rulesReplaced > 0 ? "replaced" : "applied",
      appliedById,
      metadata: { rules_created: pkg.rules.length, rules_replaced: rulesReplaced }
    }
  });

  return {
    package_id: packageId,
    portfolio_id: portfolioId,
    rules_created: pkg.rules.length,
    rules_replaced: rulesReplaced
  };
}
