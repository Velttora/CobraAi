import { ContactChannel } from "@cobrai/db";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength
} from "class-validator";

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(ContactChannel)
  channel?: ContactChannel;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}

export class CreateTemplateDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(ContactChannel)
  channel!: ContactChannel;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  @MinLength(5)
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  is_approved?: boolean;
}
