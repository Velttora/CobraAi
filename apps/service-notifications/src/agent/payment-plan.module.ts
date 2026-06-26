import { Module } from "@nestjs/common";
import { KafkaModule } from "../kafka/kafka.module";
import { PaymentPlanService } from "./payment-plan.service";

@Module({
  imports: [KafkaModule],
  providers: [PaymentPlanService],
  exports: [PaymentPlanService]
})
export class PaymentPlanModule {}
