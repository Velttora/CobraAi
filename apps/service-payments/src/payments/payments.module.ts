import { Module } from "@nestjs/common";
// GatewaysModule already provides and exports TenantIntegrationService (it
// wires it as a factory provider for GatewayService's own dispatch); this
// module reuses that same instance for PaymentLinksService rather than
// registering a second factory provider, so the two consumers share one
// TenantIntegrationService cache.
import { GatewaysModule } from "../gateways/gateways.module";
import { KafkaModule } from "../kafka/kafka.module";
import { WebhookValidatorService } from "../webhooks/webhook-validator.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { PaymentConfirmationService } from "./payment-confirmation.service";
import {
  PaymentLinksController,
  PaymentsController
} from "./payments.controller";
import { PaymentLinksService, PaymentsService } from "./payments.service";

@Module({
  imports: [KafkaModule, GatewaysModule],
  controllers: [PaymentLinksController, PaymentsController],
  providers: [
    PaymentLinksService,
    PaymentsService,
    PaymentConfirmationService,
    WebhookValidatorService,
    WebhooksService
  ]
})
export class PaymentsModule {}
