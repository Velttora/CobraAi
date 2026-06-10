import { IsArray, IsEnum, IsOptional, IsString, IsUrl, MinLength } from "class-validator";

export type OutboundEvent =
  | "debt.status_changed"
  | "payment.confirmed"
  | "promise.created"
  | "promise.broken"
  | "contact.completed";

export enum ErpTypeEnum {
  sap = "sap",
  siigo = "siigo",
  world_office = "world_office",
  helisa = "helisa",
  aspel = "aspel",
  contpaq = "contpaq",
  odoo = "odoo",
  generic = "generic"
}

export class CreateIntegrationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(ErpTypeEnum)
  erp_type!: ErpTypeEnum;

  @IsOptional()
  @IsUrl({ require_tld: false })
  outbound_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outbound_events?: OutboundEvent[];
}

export class IngestPayloadDto {
  @IsString()
  @MinLength(1)
  portfolio_id!: string;

  @IsArray()
  debts!: unknown[];
}
