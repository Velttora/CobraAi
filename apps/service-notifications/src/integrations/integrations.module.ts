import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import { PrismaModule } from "../prisma/prisma.module";
import { TwilioProvisioningService } from "./twilio-provisioning.service";
import { VapiProvisioningService } from "./vapi-provisioning.service";
import { WhatsAppConnectService } from "./whatsapp-connect.service";
import { SendgridProvisioningService } from "./sendgrid-provisioning.service";
import { EmailConnectService } from "./email-connect.service";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsController } from "./integrations.controller";

/**
 * Per-tenant provisioning and credential-resolution services for the BYO
 * channel/payment integrations (Phase 8). 08-14 adds `IntegrationsService` +
 * `IntegrationsController` — the REST surface the four Settings >
 * Integraciones screens consume, behind the api-gateway's
 * `/api/v1/integrations` proxy route.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [IntegrationsController],
  providers: [
    TwilioProvisioningService,
    VapiProvisioningService,
    WhatsAppConnectService,
    SendgridProvisioningService,
    EmailConnectService,
    IntegrationsService,
    {
      provide: TenantIntegrationService,
      useFactory: (prisma: PrismaService) => new TenantIntegrationService(prisma),
      inject: [PrismaService]
    }
  ],
  exports: [
    TwilioProvisioningService,
    VapiProvisioningService,
    WhatsAppConnectService,
    SendgridProvisioningService,
    EmailConnectService,
    IntegrationsService,
    TenantIntegrationService
  ]
})
export class IntegrationsModule {}
