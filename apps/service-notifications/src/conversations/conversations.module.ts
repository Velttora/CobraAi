import { Module } from "@nestjs/common";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { AdaptersModule } from "../adapters/adapters.module";
import { ComplianceModule } from "../compliance/compliance.module";

@Module({
  imports: [AdaptersModule, ComplianceModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService]
})
export class ConversationsModule {}
