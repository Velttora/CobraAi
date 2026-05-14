import { Module } from "@nestjs/common";
import { CarteraModule } from "./cartera/cartera.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [HealthModule, CarteraModule]
})
export class AppModule {}
