import { Module } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import { EmailLayoutController } from "./email-layout.controller";
import { EmailLayoutService } from "./email-layout.service";

@Module({
  controllers: [EmailLayoutController],
  providers: [EmailLayoutService, PrismaService]
})
export class EmailLayoutModule {}
