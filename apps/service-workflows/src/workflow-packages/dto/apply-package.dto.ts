import { IsBoolean, IsOptional } from "class-validator";

export class ApplyWorkflowPackageDto {
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
