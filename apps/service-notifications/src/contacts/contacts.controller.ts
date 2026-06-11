import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import {
  ReqContext,
  type RequestContext
} from "../common/decorators/request-context.decorator";
import { ContactsService } from "./contacts.service";
import { CreateContactDto } from "./dto/contact.dto";

@Controller("v1/contacts")
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async list(
    @ReqContext() ctx: RequestContext,
    @Query("debt_id") debtId?: string,
    @Query("channel") channel?: string,
    @Query("portfolio_id") portfolioId?: string
  ) {
    const items = await this.contactsService.list(
      ctx.tenantId,
      debtId,
      channel as import("@cobrai/db").ContactChannel | undefined,
      portfolioId
    );
    return successResponse({ items });
  }

  @Post()
  async create(
    @ReqContext() ctx: RequestContext,
    @Body() dto: CreateContactDto
  ) {
    return successResponse(
      await this.contactsService.createManual(ctx.tenantId, dto)
    );
  }
}
