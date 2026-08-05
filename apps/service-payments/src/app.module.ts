import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TenantContextMiddleware } from "@cobrai/utils";
import { HealthModule } from "./health/health.module";
import { KafkaModule } from "./kafka/kafka.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    KafkaModule,
    PaymentsModule,
    WebhooksModule,
    HealthModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.GET },
        { path: "v1/payment-links/:token", method: RequestMethod.GET },
        { path: "v1/payments/checkout/:token", method: RequestMethod.POST },
        // D-19: token-routed payment webhooks (this replaces the old
        // v1/payments/webhook/(.*) routes, now removed). A provider POST
        // carries no X-Tenant-Id header — the tenant is resolved from the
        // opaque token in the path, before this middleware would run.
        { path: "v1/webhooks/(.*)", method: RequestMethod.ALL },
        { path: "v1/payments/sandbox/:token/confirm", method: RequestMethod.POST }
      )
      .forRoutes("*");
  }
}
