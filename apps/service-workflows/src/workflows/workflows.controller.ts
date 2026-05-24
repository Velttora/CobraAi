import { Controller, Delete, Get, Param, Patch, Post, Body } from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import {
  ReqContext,
  type RequestContext
} from "../common/decorators/request-context.decorator";
import { ApplyWorkflowPackageDto } from "../workflow-packages/dto/apply-package.dto";
import { WorkflowPackagesService } from "../workflow-packages/workflow-packages.service";
import {
  CreateWorkflowRuleDto,
  UpdateWorkflowRuleDto
} from "./dto/workflow-rule.dto";
import { WorkflowsService } from "./workflows.service";

@Controller("v1/workflows")
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly packages: WorkflowPackagesService
  ) {}

  @Get("queue")
  async queue(@ReqContext() ctx: RequestContext) {
    return successResponse(await this.workflows.getQueue(ctx.tenantId));
  }

  @Get("stats")
  async stats(@ReqContext() ctx: RequestContext) {
    return successResponse(await this.workflows.getStats(ctx.tenantId));
  }

  @Get("rules")
  async listRules(@ReqContext() ctx: RequestContext) {
    return successResponse(await this.workflows.listRules(ctx.tenantId));
  }

  @Get("packages")
  async listPackages() {
    return successResponse(this.packages.listPackages());
  }

  @Get("packages/:id")
  async getPackage(@Param("id") id: string) {
    return successResponse(this.packages.getPackage(id));
  }

  @Post("packages/:id/apply")
  async applyPackage(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() dto: ApplyWorkflowPackageDto
  ) {
    return successResponse(
      await this.packages.applyPackage(ctx.tenantId, id, dto.overwrite ?? false)
    );
  }

  @Post("rules")
  async createRule(
    @ReqContext() ctx: RequestContext,
    @Body() dto: CreateWorkflowRuleDto
  ) {
    return successResponse(await this.workflows.createRule(ctx.tenantId, dto));
  }

  @Patch("rules/:id")
  async updateRule(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowRuleDto
  ) {
    return successResponse(
      await this.workflows.updateRule(ctx.tenantId, id, dto)
    );
  }

  @Delete("rules/:id")
  async deleteRule(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
    return successResponse(
      await this.workflows.deactivateRule(ctx.tenantId, id)
    );
  }

  @Post("trigger/:debtId")
  async trigger(
    @ReqContext() ctx: RequestContext,
    @Param("debtId") debtId: string
  ) {
    return successResponse(
      await this.workflows.triggerDebtEvaluation(ctx.tenantId, debtId)
    );
  }
}
