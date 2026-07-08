import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ComplianceModule } from "../compliance/compliance.module";
import { AdaptersModule } from "../adapters/adapters.module";
import { KafkaModule } from "../kafka/kafka.module";
import { OrchestratorModule } from "../orchestrator/orchestrator.module";
import { AgentModule } from "../agent/agent.module";
import { MemoryModule } from "../memory/memory.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import { KafkaConsumerService } from "./kafka.consumer";
import { DebtorContactCoordinatorService } from "../orchestrator/debtor-contact-coordinator.service";
import { ContactRetrySweepService } from "../orchestrator/contact-retry-sweep.service";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ComplianceModule,
    AdaptersModule,
    OrchestratorModule,
    KafkaModule,
    AgentModule,
    MemoryModule,
    ConversationsModule
  ],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    KafkaConsumerService,
    DebtorContactCoordinatorService,
    ContactRetrySweepService
  ],
  exports: [ContactsService]
})
export class ContactsModule {}
