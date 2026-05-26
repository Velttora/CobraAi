import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ClerkAuthGuard } from "./common/guards/clerk-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import { TenantInterceptor } from "./common/interceptors/tenant.interceptor";
import { HealthModule } from "./health/health.module";
import { ProxyModule } from "./proxy/proxy.module";
import { RateLimitMiddleware } from "./rate-limit/rate-limit.middleware";
import { RateLimitModule } from "./rate-limit/rate-limit.module";
import { WebhookModule } from "./webhook/webhook.module";
import { PrismaService } from "@cobrai/db";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WebhookModule,
    HealthModule,
    RateLimitModule,
    ProxyModule
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RateLimitMiddleware)
      .exclude(
        { path: "", method: RequestMethod.GET },
        { path: "health", method: RequestMethod.GET },
        { path: "api/v1/webhooks/clerk", method: RequestMethod.POST }
      )
      .forRoutes("*");
  }
}
