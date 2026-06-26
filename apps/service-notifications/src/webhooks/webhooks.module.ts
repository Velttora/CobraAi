import { Module } from "@nestjs/common";
import { AdaptersModule } from "../adapters/adapters.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { KafkaModule } from "../kafka/kafka.module";
import { MemoryModule } from "../memory/memory.module";
import { PaymentPlanModule } from "../agent/payment-plan.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { TwilioWaWebhookHandler } from "./twilio-wa-webhook.handler";
import { VapiWebhookHandler } from "./vapi-webhook.handler";
import { SendgridInboundHandler } from "./sendgrid-inbound.handler";

@Module({
  imports: [AdaptersModule, ComplianceModule, KafkaModule, MemoryModule, PaymentPlanModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, TwilioWaWebhookHandler, VapiWebhookHandler, SendgridInboundHandler]
})
export class WebhooksModule {}
