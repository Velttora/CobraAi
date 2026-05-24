import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { Prisma } from "@cobrai/db";
import { PrismaService } from "@cobrai/db";
import {
  getWorkflowPackageDefinition,
  getWorkflowPackageDefinitions,
  toPackageSummary
} from "./workflow-packages.registry";
import {
  PACKAGE_SOURCE_KEY,
  type WorkflowPackageDefinition,
  type WorkflowPackageSummary
} from "./workflow-packages.types";

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
      where: this.packageRuleWhere(tenantId, packageId)
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
    const pkg = this.getPackage(packageId);
    const existingCount = await this.countAppliedRules(tenantId, packageId);

    if (existingCount > 0 && !overwrite) {
      throw new ConflictException({
        code: "PACKAGE_ALREADY_APPLIED",
        message:
          "Este paquete ya fue aplicado. Confirma si deseas reemplazar las reglas existentes.",
        package_id: packageId,
        existing_count: existingCount
      });
    }

    let rulesReplaced = 0;

    if (existingCount > 0 && overwrite) {
      const replaced = await this.prisma.workflowRule.updateMany({
        where: this.packageRuleWhere(tenantId, packageId),
        data: { isActive: false, deletedAt: new Date() }
      });
      rulesReplaced = replaced.count;
    }

    await this.prisma.workflowRule.createMany({
      data: pkg.rules.map((rule) => ({
        tenantId,
        name: rule.name,
        trigger: rule.trigger as never,
        condition: {
          ...rule.condition,
          [PACKAGE_SOURCE_KEY]: packageId
        } as Prisma.InputJsonValue,
        action: rule.action as never,
        channel: rule.channel as never,
        delayHours: rule.delay_hours ?? 0,
        priority: rule.priority ?? 100,
        isActive: true
      }))
    });

    return {
      package_id: packageId,
      rules_created: pkg.rules.length,
      rules_replaced: rulesReplaced
    };
  }

  private packageRuleWhere(tenantId: string, packageId: string) {
    return {
      tenantId,
      deletedAt: null,
      condition: {
        path: [PACKAGE_SOURCE_KEY],
        equals: packageId
      }
    };
  }
}
