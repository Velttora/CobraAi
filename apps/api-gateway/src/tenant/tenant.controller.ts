import { Body, Controller, Get, Patch } from "@nestjs/common";
import { CurrentUser, type CurrentUserContext } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { successResponse } from "../common/utils/api.utils";
import type {
  UpdateContactRetryPolicyDto,
  UpdateTenantDto
} from "./dto/tenant-profile.dto";
import { TenantService } from "./tenant.service";

@Controller("api/v1/tenant")
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  async getCurrent(@CurrentUser() user: CurrentUserContext) {
    return successResponse(
      await this.tenantService.getCurrent(user.tenantId)
    );
  }

  @Roles("admin")
  @Patch()
  async update(
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: UpdateTenantDto
  ) {
    return successResponse(
      await this.tenantService.updateName(
        user.tenantId,
        dto.name,
        user.role
      )
    );
  }

  @Roles("admin")
  @Patch("contact-retry-policy")
  async updateContactRetryPolicy(
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: UpdateContactRetryPolicyDto
  ) {
    return successResponse(
      await this.tenantService.updateContactRetryPolicy(
        user.tenantId,
        dto,
        user.role
      )
    );
  }
}
