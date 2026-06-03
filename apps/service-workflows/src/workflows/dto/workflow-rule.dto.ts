import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min
} from "class-validator";
import type {
  ContactChannel,
  WorkflowAction,
  WorkflowTrigger
} from "@cobrai/db";

export class CreateWorkflowRuleDto {
  @IsUUID()
  portfolio_id!: string;

  @IsString()
  name!: string;

  @IsEnum([
    "debt_created",
    "debt_updated",
    "score_updated",
    "promise_broken",
    "payment_confirmed",
    "schedule",
    "manual"
  ] as const)
  trigger!: WorkflowTrigger;

  @IsObject()
  condition!: Record<string, unknown>;

  @IsEnum([
    "send_notification",
    "escalate_human",
    "update_status",
    "assign_strategy",
    "create_task"
  ] as const)
  action!: WorkflowAction;

  @IsOptional()
  @IsEnum(["whatsapp", "voice", "email"] as const)
  channel?: ContactChannel;

  @IsOptional()
  @IsInt()
  @Min(0)
  delay_hours?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateWorkflowRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsEnum([
    "send_notification",
    "escalate_human",
    "update_status",
    "assign_strategy",
    "create_task"
  ] as const)
  action?: WorkflowAction;

  @IsOptional()
  @IsEnum(["whatsapp", "voice", "email"] as const)
  channel?: ContactChannel;

  @IsOptional()
  @IsInt()
  @Min(0)
  delay_hours?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
