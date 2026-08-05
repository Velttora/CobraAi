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

/**
 * Per-tenant provisioning and credential-resolution services for the BYO
 * channel/payment integrations (Phase 8). 08-14 adds `IntegrationsService`
 * (this file) and `IntegrationsController` (registered as `controllers`
 * once Task 2 creates it) — the REST surface the four Settings >
 * Integraciones screens consume.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
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
