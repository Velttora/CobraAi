import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import {
  applyPackageToPortfolio,
  applyPackageToTenant,
  countPortfolioPackageRules,
  getWorkflowPackageDefinition,
  getWorkflowPackageDefinitions,
  toPackageSummary,
  type WorkflowPackageDefinition,
  type WorkflowPackageSummary
} from "@cobrai/workflow-packages";

@Injectable()
export class WorkflowPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  listPackages(): WorkflowPackageSummary[] {
    return getWorkflowPackageDefinitions().map(toPackageSummary);
  }

  getPackage(id: string): WorkflowPackageDefinition {
    const pkg = getWorkflowPackageDefinition(id);
    if (!pkg) {
      throw new NotFoundException(`Paquete '${id}' no encontrado`);
    }
    return pkg;
  }

  async countAppliedRules(tenantId: string, packageId: string): Promise<number> {
    return this.prisma.workflowRule.count({
      where: {
        tenantId,
        portfolioId: null,
        deletedAt: null,
        condition: {
          path: ["__source_package"],
          equals: packageId
        }
      }
    });
  }

  async applyPackage(
    tenantId: string,
    packageId: string,
    overwrite = false
  ): Promise<{
    package_id: string;
    rules_created: number;
    rules_replaced: number;
  }> {
    this.getPackage(packageId);

    try {
      return await applyPackageToTenant(this.prisma, tenantId, packageId, overwrite);
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
            "Este paquete ya fue aplicado. Confirma si deseas reemplazar las reglas existentes.",
          package_id: err.package_id,
          existing_count: err.existing_count
        });
      }
      throw error;
    }
  }

  async applyPackageToPortfolio(
    tenantId: string,
    portfolioId: string,
    packageId: string,
    overwrite = false,
    appliedById?: string
  ): Promise<{
    package_id: string;
    portfolio_id: string;
    rules_created: number;
    rules_replaced: number;
  }> {
    this.getPackage(packageId);

    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, tenantId, deletedAt: null }
    });
    if (!portfolio) {
      throw new NotFoundException("Portafolio no encontrado");
    }

    try {
      const result = await applyPackageToPortfolio(this.prisma, {
        tenantId,
        portfolioId,
        packageId,
        overwrite,
        appliedById,
        previousPackageSlug: portfolio.activePackageSlug
      });
      return {
        package_id: result.package_id,
        portfolio_id: portfolioId,
        rules_created: result.rules_created,
        rules_replaced: result.rules_replaced
      };
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
      throw error;
    }
  }

  async countPortfolioAppliedRules(
    tenantId: string,
    portfolioId: string,
    packageId: string
  ): Promise<number> {
    return countPortfolioPackageRules(
      this.prisma,
      tenantId,
      portfolioId,
      packageId
    );
  }
}
