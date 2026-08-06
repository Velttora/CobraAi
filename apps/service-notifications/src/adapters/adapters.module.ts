import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import { EmailAdapter } from "./email.adapter";
import { SmsAdapter } from "./sms.adapter";
import { TwilioWhatsAppAdapter } from "./twilio-whatsapp.adapter";
import { VapiVoiceAdapter } from "./vapi-voice.adapter";
import { KafkaModule } from "../kafka/kafka.module";

@Module({
  imports: [KafkaModule, ConfigModule],
  providers: [
    EmailAdapter,
    SmsAdapter,
    TwilioWhatsAppAdapter,
    VapiVoiceAdapter,
    {
      provide: TenantIntegrationService,
      useFactory: (prisma: PrismaService) => new TenantIntegrationService(prisma),
      inject: [PrismaService]
    }
  ],
  exports: [EmailAdapter, SmsAdapter, TwilioWhatsAppAdapter, VapiVoiceAdapter, TenantIntegrationService]
})
export class AdaptersModule {}
