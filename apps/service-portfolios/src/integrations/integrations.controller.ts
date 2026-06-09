import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import {
  ReqContext,
  type RequestContext
} from "../common/decorators/request-context.decorator";
import { IntegrationsService } from "./integrations.service";
import { CreateIntegrationDto, IngestPayloadDto } from "./dto/integration.dto";

@Controller("v1/integrations")
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  async list(@ReqContext() ctx: RequestContext) {
    const items = await this.integrationsService.list(ctx.tenantId);
    return successResponse({ items });
  }

  @Post()
  async create(
    @ReqContext() ctx: RequestContext,
    @Body() dto: CreateIntegrationDto
  ) {
    const result = await this.integrationsService.create(ctx.tenantId, dto);
    return successResponse(result);
  }

  @Delete(":id")
  @HttpCode(204)
  async delete(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
    await this.integrationsService.delete(ctx.tenantId, id);
  }

  @Post(":id/test")
  async test(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
    const result = await this.integrationsService.test(ctx.tenantId, id);
    return successResponse(result);
  }

  /**
   * Public endpoint — authenticated via X-Api-Key, NOT via Clerk JWT.
   * TenantContextMiddleware is excluded for this path in AppModule.
   */
  @Post("ingest")
  @HttpCode(200)
  async ingest(
    @Headers("x-api-key") apiKey: string | undefined,
    @Body() dto: IngestPayloadDto
  ) {
    if (!apiKey) throw new UnauthorizedException("Header X-Api-Key requerido");
    const result = await this.integrationsService.ingest(
      apiKey,
      dto.portfolio_id,
      dto.debts
    );
    return successResponse(result);
  }
}
