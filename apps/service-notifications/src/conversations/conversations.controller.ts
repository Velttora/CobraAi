import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  BadRequestException
} from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import {
  ReqContext,
  type RequestContext
} from "../common/decorators/request-context.decorator";
import { ConversationsService } from "./conversations.service";
import { ReplyDto } from "./reply.dto";

@Controller("v1/conversations")
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  // ─── GET /v1/conversations — lista paginada ───────────────────────────────
  @Get()
  async list(
    @ReqContext() ctx: RequestContext,
    @Query("channel") channel?: string,
    @Query("status") status?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "25",
    @Query("portfolio_id") portfolioId?: string,
    @Query("outcome") outcome?: string
  ) {
    return successResponse(
      await this.conversationsService.listConversations(ctx.tenantId, {
        channel,
        status,
        outcome,
        page: Number(page),
        limit: Number(limit),
        portfolioId
      })
    );
  }

  // ─── GET /v1/conversations/escalations ───────────────────────────────────
  @Get("escalations")
  async escalations(@ReqContext() ctx: RequestContext) {
    return successResponse(
      await this.conversationsService.listEscalations(ctx.tenantId)
    );
  }

  // ─── PATCH /v1/conversations/escalations/:id/resolve ─────────────────────
  @Patch("escalations/:id/resolve")
  async resolveEscalation(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() body: { outcome?: string; note?: string }
  ) {
    const outcome = body.outcome;
    if (outcome !== "pending" && outcome !== "promised") {
      throw new BadRequestException("outcome debe ser 'pending' o 'promised'");
    }
    return successResponse(
      await this.conversationsService.resolveEscalation(ctx.tenantId, id, outcome, body.note)
    );
  }

  // ─── GET /v1/conversations/:id/messages ──────────────────────────────────
  @Get(":id/messages")
  async messages(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Query("page") page = "1",
    @Query("limit") limit = "50"
  ) {
    return successResponse(
      await this.conversationsService.getMessages(ctx.tenantId, id, {
        page: Number(page),
        limit: Number(limit)
      })
    );
  }

  // ─── POST /v1/conversations/:id/reply ─────────────────────────────────────
  @Post(":id/reply")
  async reply(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() dto: ReplyDto
  ) {
    return successResponse(
      await this.conversationsService.reply(ctx.tenantId, id, dto.body)
    );
  }

  // ─── GET /v1/conversations/debtor/:debtor_id (legacy) ────────────────────
  @Get("debtor/:debtor_id")
  async getByDebtor(
    @ReqContext() ctx: RequestContext,
    @Param("debtor_id") debtorId: string
  ) {
    return successResponse(
      await this.conversationsService.getByDebtor(ctx.tenantId, debtorId)
    );
  }
}
