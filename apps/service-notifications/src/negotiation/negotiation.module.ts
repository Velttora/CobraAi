import { Module } from "@nestjs/common";
import { NegotiationsController } from "./negotiation.controller";
import { NegotiationService } from "./negotiation.service";

@Module({
  controllers: [NegotiationsController],
  providers: [NegotiationService],
  exports: [NegotiationService]
})
export class NegotiationModule {}
