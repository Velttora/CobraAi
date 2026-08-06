import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import {
  ReqContext,
  type RequestContext
} from "../common/decorators/request-context.decorator";
import { NegotiationService, type CommitmentFilters } from "./negotiation.service";

@Controller("v1/negotiations")
export class NegotiationsController {
  constructor(private readonly negotiations: NegotiationService) {}

  // ─── GET /v1/negotiations — bandeja de promesas y acuerdos ────────────────
  @Get()
  async list(
    @ReqContext() ctx: RequestContext,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("portfolio_id") portfolioId?: string,
    @Query("debt_id") debtId?: string,
    @Query("debtor_id") debtorId?: string,
    @Query("search") search?: string,
    @Query("limit") limit?: string
  ) {
    return successResponse(
      await this.negotiations.list(ctx.tenantId, parseFilters({
        status,
        type,
        portfolioId,
        debtId,
        debtorId,
        search,
        limit
      }))
    );
  }

  // ─── GET /v1/negotiations/summary — totales del encabezado ────────────────
  // Va antes de cualquier ":id" que se agregue después, para que "summary" no
  // se lea como el id de un compromiso.
  @Get("summary")
  async summary(
    @ReqContext() ctx: RequestContext,
    @Query("type") type?: string,
    @Query("portfolio_id") portfolioId?: string,
    @Query("debtor_id") debtorId?: string,
    @Query("search") search?: string
  ) {
    return successResponse(
      await this.negotiations.summary(
        ctx.tenantId,
        parseFilters({ type, portfolioId, debtorId, search })
      )
    );
  }

  // ─── POST /v1/negotiations/:id/approve — el acuerdo recién existe acá ─────
  @Post(":id/approve")
  async approve(@ReqContext() ctx: RequestContext, @Param("id") id: string) {
    return successResponse(
      await this.negotiations.approve(ctx.tenantId, id, ctx.userId, ctx.userRole)
    );
  }

  // ─── POST /v1/negotiations/:id/reject ────────────────────────────────────
  @Post(":id/reject")
  async reject(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() body: { reason?: string }
  ) {
    return successResponse(
      await this.negotiations.reject(ctx.tenantId, id, {
        reason: body?.reason,
        rejectedBy: ctx.userId,
        role: ctx.userRole
      })
    );
  }
}

function parseFilters(raw: {
  status?: string;
  type?: string;
  portfolioId?: string;
  debtId?: string;
  debtorId?: string;
  search?: string;
  limit?: string;
}): CommitmentFilters {
  const limit = raw.limit ? Number(raw.limit) : undefined;
  return {
    status: raw.status,
    type: raw.type,
    portfolioId: raw.portfolioId || undefined,
    debtId: raw.debtId || undefined,
    debtorId: raw.debtorId || undefined,
    search: raw.search?.trim() || undefined,
    limit: Number.isFinite(limit) ? limit : undefined
  };
}
