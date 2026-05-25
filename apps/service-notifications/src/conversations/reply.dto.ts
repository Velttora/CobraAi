import { IsNotEmpty, IsString } from "class-validator";

export class ReplyDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}
