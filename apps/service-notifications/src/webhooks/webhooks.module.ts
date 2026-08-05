import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "@cobrai/db";
import { AuditService } from "@cobrai/compliance";
import { TenantIntegrationService } from "@cobrai/integrations";
import { AdaptersModule } from "../adapters/adapters.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { ContactsModule } from "../contacts/contacts.module";
import { KafkaModule } from "../kafka/kafka.module";
import { MemoryModule } from "../memory/memory.module";
import { PaymentPlanModule } from "../agent/payment-plan.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { TwilioWaWebhookHandler } from "./twilio-wa-webhook.handler";
import { VapiWebhookHandler } from "./vapi-webhook.handler";
import { SendgridInboundHandler } from "./sendgrid-inbound.handler";

@Module({
  imports: [
    AdaptersModule,
    ComplianceModule,
    ConfigModule,
    ContactsModule,
    KafkaModule,
    MemoryModule,
    PaymentPlanModule
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    TwilioWaWebhookHandler,
    VapiWebhookHandler,
    SendgridInboundHandler,
    // Token guard collaborators (D-19/D-20), factory providers following
    // compliance.module.ts's pattern.
    {
      provide: TenantIntegrationService,
      useFactory: (prisma: PrismaService) => new TenantIntegrationService(prisma),
      inject: [PrismaService]
    },
    {
      provide: AuditService,
      useFactory: (prisma: PrismaService) => new AuditService(prisma),
      inject: [PrismaService]
    }
  ]
})
export class WebhooksModule {}
