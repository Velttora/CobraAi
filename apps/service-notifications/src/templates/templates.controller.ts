import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import {
  ReqContext,
  type RequestContext
} from "../common/decorators/request-context.decorator";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";
import { TemplatesService } from "./templates.service";

@Controller("v1/templates")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async list(@ReqContext() ctx: RequestContext) {
    const items = await this.templatesService.list(ctx.tenantId);
    return successResponse({ items });
  }

  @Post()
  async create(
    @ReqContext() ctx: RequestContext,
    @Body() dto: CreateTemplateDto
  ) {
    return successResponse(
      await this.templatesService.create(ctx.tenantId, dto)
    );
  }

  @Patch(":id")
  async update(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto
  ) {
    return successResponse(await this.templatesService.update(ctx.tenantId, id, dto));
  }

  @Delete(":id")
  async delete(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
    return successResponse(await this.templatesService.delete(ctx.tenantId, id));
  }
}
