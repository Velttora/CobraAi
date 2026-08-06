import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";
import type { IntegrationMode } from "@cobrai/db";

/**
 * Request body for `PUT /v1/integrations/:provider`. `publicConfig`/`secrets`
 * are typed as plain `Record<string, string>` (not nested DTO classes) so
 * `ValidationPipe`'s `whitelist: true`/`forbidNonWhitelisted: true` (see
 * `main.ts`) does not strip or reject arbitrary per-provider keys — the same
 * pattern `SendgridInboundHandler` already relies on (Phase 6, STATE.md).
 *
 * `mode` is required and explicitly `managed`/`byo` (D-01/D-10): every
 * channel that supports both must have the caller pick one — there is no
 * implicit default at the DTO layer. Payment providers are BYO-only (D-06);
 * `IntegrationsService.save` rejects `managed` for those at the service layer.
 */
export class SaveIntegrationDto {
  @IsIn(["managed", "byo"])
  mode!: IntegrationMode;

  @IsOptional()
  @IsObject()
  publicConfig?: Record<string, string>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;
}

/** Request body for `POST /v1/integrations/whatsapp/embedded-signup` (D-25). */
export class EmbeddedSignupDto {
  @IsString()
  @IsNotEmpty()
  wabaId!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumberId!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumberE164!: string;

  @IsString()
  @IsNotEmpty()
  businessName!: string;
}

/** Query params for `GET /v1/integrations/uncontacted-debts`. */
export class UncontactedDebtsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
