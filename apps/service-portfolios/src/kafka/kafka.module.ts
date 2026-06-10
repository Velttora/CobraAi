import { Global, Module, forwardRef } from "@nestjs/common";
import { DebtsModule } from "../debts/debts.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { KafkaConsumerService } from "./kafka.consumer";
import { KafkaService } from "./kafka.service";

@Global()
@Module({
  imports: [DebtsModule, forwardRef(() => IntegrationsModule)],
  providers: [KafkaService, KafkaConsumerService],
  exports: [KafkaService]
})
export class KafkaModule {}
