import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserContext
} from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { successResponse } from "../common/utils/api.utils";
import type { UpdateEmailLayoutDto } from "./dto/email-layout.dto";
import { EmailLayoutService } from "./email-layout.service";

@Controller("api/v1/email-layout")
export class EmailLayoutController {
  constructor(private readonly emailLayoutService: EmailLayoutService) {}

  @Get()
  async get(@CurrentUser() user: CurrentUserContext) {
    return successResponse(await this.emailLayoutService.get(user.tenantId));
  }

  @Roles("admin")
  @Put()
  async save(
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: UpdateEmailLayoutDto
  ) {
    return successResponse(
      await this.emailLayoutService.saveDraft(
        user.tenantId,
        user.role,
        dto,
        user.clerkUserId
      )
    );
  }

  @Roles("admin")
  @Post("publish")
  async publish(@CurrentUser() user: CurrentUserContext) {
    return successResponse(
      await this.emailLayoutService.publish(
        user.tenantId,
        user.role,
        user.clerkUserId
      )
    );
  }
}
