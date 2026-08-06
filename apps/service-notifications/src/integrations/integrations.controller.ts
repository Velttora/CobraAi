import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import { ReqContext, type RequestContext } from "../common/decorators/request-context.decorator";
import { IntegrationsService } from "./integrations.service";
import { EmbeddedSignupDto, SaveIntegrationDto, UncontactedDebtsQueryDto } from "./dto/integration.dto";

const DEFAULT_UNCONTACTED_DEBTS_PAGE_SIZE = 25;

/**
 * REST surface for the four Settings > Integraciones screens (D-23/D-24).
 * Every write forwards `ctx.userRole` into `IntegrationsService`, whose own
 * `assertAdmin` enforces the gate — no role-guard decorator here: that
 * mechanism lives in api-gateway and is not registered in service-notifications.
 */
@Controller("v1/integrations")
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  async list(@ReqContext() ctx: RequestContext) {
    const items = await this.integrationsService.list(ctx.tenantId);
    return successResponse({ items });
  }

  @Get("health")
  async health(@ReqContext() ctx: RequestContext) {
    return successResponse(await this.integrationsService.health(ctx.tenantId));
  }

  @Get("uncontacted-debts")
  async uncontactedDebts(@ReqContext() ctx: RequestContext, @Query() query: UncontactedDebtsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_UNCONTACTED_DEBTS_PAGE_SIZE;
    return successResponse(await this.integrationsService.uncontactedDebts(ctx.tenantId, page, pageSize));
  }

  @Put(":provider")
  async save(@ReqContext() ctx: RequestContext, @Param("provider") provider: string, @Body() dto: SaveIntegrationDto) {
    return successResponse(await this.integrationsService.save(ctx.tenantId, provider, dto, ctx.userRole));
  }

  @Delete(":provider")
  async disconnect(@ReqContext() ctx: RequestContext, @Param("provider") provider: string) {
    return successResponse(await this.integrationsService.disconnect(ctx.tenantId, provider, ctx.userRole));
  }

  @Post(":provider/verify")
  async verify(@ReqContext() ctx: RequestContext, @Param("provider") provider: string) {
    return successResponse(await this.integrationsService.verify(ctx.tenantId, provider, ctx.userRole));
  }

  @Post("whatsapp/embedded-signup")
  async embeddedSignup(@ReqContext() ctx: RequestContext, @Body() dto: EmbeddedSignupDto) {
    return successResponse(await this.integrationsService.embeddedSignup(ctx.tenantId, dto, ctx.userRole));
  }

  @Post("email/recheck-dns")
  async recheckEmailDns(@ReqContext() ctx: RequestContext) {
    return successResponse(await this.integrationsService.recheckEmailDns(ctx.tenantId, ctx.userRole));
  }
}
