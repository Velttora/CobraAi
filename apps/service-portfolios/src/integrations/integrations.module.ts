import { Module } from "@nestjs/common";
import { DebtsModule } from "../debts/debts.module";
import { DebtorsModule } from "../debtors/debtors.module";
import { PortfoliosModule } from "../portfolios/portfolios.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [DebtsModule, DebtorsModule, PortfoliosModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService]
})
export class IntegrationsModule {}
