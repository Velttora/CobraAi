import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query
} from "@nestjs/common";
import { successResponse } from "../common/utils/api.utils";
import {
  ReqContext,
  type RequestContext
} from "../common/decorators/request-context.decorator";
import { CreatePaymentLinkDto, RefundPaymentDto } from "./dto/payment.dto";
import {
  PaymentLinksService,
  PaymentsService
} from "./payments.service";

@Controller("v1/payment-links")
export class PaymentLinksController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Post()
  async create(
    @ReqContext() ctx: RequestContext,
    @Body() dto: CreatePaymentLinkDto
  ) {
    return successResponse(await this.paymentLinks.create(ctx.tenantId, dto));
  }

  @Get(":token")
  async getPublic(@Param("token") token: string) {
    return successResponse(await this.paymentLinks.getPublicByToken(token));
  }
}

@Controller("v1/payments")
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly paymentLinks: PaymentLinksService
  ) {}

  @Get()
  async list(
    @ReqContext() ctx: RequestContext,
    @Query("debt_id") debtId?: string
  ) {
    const items = await this.payments.list(ctx.tenantId, debtId);
    return successResponse({ items });
  }

  @Post("checkout/:token")
  async checkout(
    @Param("token") token: string,
    @Body() body: { gateway?: string }
  ) {
    return successResponse(
      await this.paymentLinks.checkout(token, body?.gateway)
    );
  }

  @Post("sandbox/:token/confirm")
  async sandboxConfirm(@Param("token") token: string) {
    return successResponse(await this.paymentLinks.simulateSandboxPayment(token));
  }

  @Post(":id/refund")
  async refund(
    @ReqContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body() dto: RefundPaymentDto
  ) {
    return successResponse(
      await this.payments.refund(ctx.tenantId, id, dto.amount)
    );
  }

}
