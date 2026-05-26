import { Module } from "@nestjs/common";
import { AiScoringModule } from "../ai-scoring/ai-scoring.module";
import { PortfoliosController } from "./portfolios.controller";
import { PortfoliosService } from "./portfolios.service";

@Module({
  imports: [AiScoringModule],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
  exports: [PortfoliosService]
})
export class PortfoliosModule {}
