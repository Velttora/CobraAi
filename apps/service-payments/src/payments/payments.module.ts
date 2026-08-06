import { Module } from "@nestjs/common";
// GatewaysModule already provides and exports TenantIntegrationService (it
// wires it as a factory provider for GatewayService's own dispatch); this
// module reuses that same instance for PaymentLinksService rather than
// registering a second factory provider, so the two consumers share one
// TenantIntegrationService cache.
import { GatewaysModule } from "../gateways/gateways.module";
import { KafkaModule } from "../kafka/kafka.module";
import { PaymentConfirmationService } from "./payment-confirmation.service";
import {
  PaymentLinksController,
  PaymentsController
} from "./payments.controller";
import { PaymentLinksService, PaymentsService } from "./payments.service";

// WebhookValidatorService/WebhooksService moved to WebhooksModule (08-12,
// D-19) along with the new token-routed WebhooksController — PaymentsModule
// no longer needs them since the legacy webhook/conekta and webhook/mp
// routes were removed from PaymentsController.
@Module({
  imports: [KafkaModule, GatewaysModule],
  controllers: [PaymentLinksController, PaymentsController],
  providers: [PaymentLinksService, PaymentsService, PaymentConfirmationService]
})
export class PaymentsModule {}
