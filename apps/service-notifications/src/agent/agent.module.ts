import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ConversationAgentService } from "./conversation-agent.service";
import { KafkaModule } from "../kafka/kafka.module";
import { AdaptersModule } from "../adapters/adapters.module";
import { MemoryModule } from "../memory/memory.module";
import { PaymentPlanModule } from "./payment-plan.module";
import { ComplianceModule } from "../compliance/compliance.module";

@Module({
  imports: [
    KafkaModule,
    AdaptersModule,
    ConfigModule,
    MemoryModule,
    PaymentPlanModule,
    ComplianceModule
  ],
  providers: [ConversationAgentService],
  exports: [ConversationAgentService]
})
export class AgentModule {}
