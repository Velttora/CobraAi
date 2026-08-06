import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TenantContextMiddleware } from "@cobrai/utils";
import { ContactsModule } from "./contacts/contacts.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { HealthModule } from "./health/health.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { KafkaModule } from "./kafka/kafka.module";
import { NegotiationModule } from "./negotiation/negotiation.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TemplatesModule } from "./templates/templates.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    KafkaModule,
    ContactsModule,
    TemplatesModule,
    ConversationsModule,
    NegotiationModule,
    WebhooksModule,
    IntegrationsModule,
    HealthModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.GET },
        { path: "v1/webhooks/(.*)", method: RequestMethod.ALL }
      )
      .forRoutes("*");
  }
}
