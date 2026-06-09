import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";
import { TenantContextMiddleware } from "@cobrai/utils";
import { AiScoringModule } from "./ai-scoring/ai-scoring.module";
import { AuditModule } from "./audit/audit.module";
import { DebtsModule } from "./debts/debts.module";
import { DebtorsModule } from "./debtors/debtors.module";
import { HealthModule } from "./health/health.module";
import { ImportModule } from "./import/import.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { KafkaModule } from "./kafka/kafka.module";
import { PortfoliosModule } from "./portfolios/portfolios.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, "../../../.env"),
        join(__dirname, "../.env"),
        ".env"
      ]
    }),
    PrismaModule,
    KafkaModule,
    AiScoringModule,
    AuditModule,
    HealthModule,
    PortfoliosModule,
    DebtsModule,
    DebtorsModule,
    ImportModule,
    IntegrationsModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.GET },
        { path: "v1/integrations/ingest", method: RequestMethod.POST }
      )
      .forRoutes("*");
  }
}
