import { Module } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import { AuditService } from "@cobrai/compliance";
import { TenantIntegrationService } from "@cobrai/integrations";
import { KafkaModule } from "../kafka/kafka.module";
import { PaymentConfirmationService } from "../payments/payment-confirmation.service";
import { WebhookValidatorService } from "./webhook-validator.service";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

@Module({
  imports: [KafkaModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    PaymentConfirmationService,
    WebhookValidatorService,
    // Factory providers follow apps/service-notifications/src/compliance/compliance.module.ts:
    // plain classes with no NestJS dependency, wired per-app with PrismaService.
    {
      provide: AuditService,
      useFactory: (prisma: PrismaService) => new AuditService(prisma),
      inject: [PrismaService]
    },
    {
      provide: TenantIntegrationService,
      useFactory: (prisma: PrismaService) => new TenantIntegrationService(prisma),
      inject: [PrismaService]
    }
  ],
  exports: [WebhooksService, WebhookValidatorService, TenantIntegrationService]
})
export class WebhooksModule {}
