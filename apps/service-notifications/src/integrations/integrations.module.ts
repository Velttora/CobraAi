import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import { PrismaModule } from "../prisma/prisma.module";
import { TwilioProvisioningService } from "./twilio-provisioning.service";
import { VapiProvisioningService } from "./vapi-provisioning.service";
import { WhatsAppConnectService } from "./whatsapp-connect.service";

/**
 * Per-tenant provisioning and credential-resolution services for the BYO
 * channel/payment integrations (Phase 8). Plans 08-10 (payment gateway BYO)
 * and 08-14 (webhook token guard) add further providers to this module.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    TwilioProvisioningService,
    VapiProvisioningService,
    WhatsAppConnectService,
    {
      provide: TenantIntegrationService,
      useFactory: (prisma: PrismaService) => new TenantIntegrationService(prisma),
      inject: [PrismaService]
    }
  ],
  exports: [TwilioProvisioningService, VapiProvisioningService, WhatsAppConnectService, TenantIntegrationService]
})
export class IntegrationsModule {}
