import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

export class CreatePortfolioDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(["COP", "MXN", "USD", "BRL"])
  currency?: string;

  @IsOptional()
  @IsIn(["none", "package", "custom"])
  strategy?: "none" | "package" | "custom";

  @IsOptional()
  @IsString()
  package_slug?: string;
}

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(["active", "paused", "archived"])
  status?: "active" | "paused" | "archived";
}

export class UpdatePortfolioStrategyDto {
  @IsIn(["none", "package", "custom"])
  strategy!: "none" | "package" | "custom";

  @IsOptional()
  @IsString()
  package_slug?: string;

  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
