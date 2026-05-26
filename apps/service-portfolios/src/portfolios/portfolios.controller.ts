import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import {
  ReqContext,
  type RequestContext
} from "../common/decorators/request-context.decorator";
import { ScoringService } from "../ai-scoring/scoring.service";
import { CreatePortfolioDto, UpdatePortfolioDto, UpdatePortfolioStrategyDto } from "./dto/portfolio.dto";
import { PortfoliosService } from "./portfolios.service";

@Controller("v1/portfolios")
export class PortfoliosController {
  constructor(
    private readonly portfoliosService: PortfoliosService,
    private readonly scoringService: ScoringService
  ) {}

  @Get()
  async list(
    @ReqContext() ctx: RequestContext,
    @Query() query: Record<string, unknown>
  ) {
    const result = await this.portfoliosService.list(ctx.tenantId, query);
    return successResponse({
      items: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        total_pages: Math.ceil(result.total / result.limit)
      }
    });
  }

  @Post()
  async create(
    @ReqContext() ctx: RequestContext,
    @Body() dto: CreatePortfolioDto
  ) {
    const portfolio = await this.portfoliosService.create(
      ctx.tenantId,
      dto,
      ctx.userId
    );
    return successResponse(portfolio);
  }

  @Patch(":id/strategy")
  async updateStrategy(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() dto: UpdatePortfolioStrategyDto
  ) {
    return successResponse(
      await this.portfoliosService.updateStrategy(
        ctx.tenantId,
        id,
        dto,
        ctx.userId
      )
    );
  }

  @Get(":id")
  async findOne(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
    const portfolio = await this.portfoliosService.findOne(ctx.tenantId, id);
    const stats = await this.portfoliosService.stats(ctx.tenantId, id);
    return successResponse({ ...portfolio, stats_summary: stats });
  }

  @Get(":id/stats")
  async stats(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
    return successResponse(await this.portfoliosService.stats(ctx.tenantId, id));
  }

  @Patch(":id")
  async update(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() dto: UpdatePortfolioDto
  ) {
    return successResponse(
      await this.portfoliosService.update(ctx.tenantId, id, dto)
    );
  }

  @Delete(":id")
  async remove(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
    return successResponse(
      await this.portfoliosService.softDelete(ctx.tenantId, id)
    );
  }

  @Post("resegment-all")
  async resegmentAll(@ReqContext() ctx: RequestContext) {
    const updated = await this.scoringService.refreshPriorityScoresForTenant(ctx.tenantId);
    return successResponse({ updated });
  }
}
