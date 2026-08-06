import { Module } from "@nestjs/common";
import { PaymentPlanModule } from "../agent/payment-plan.module";
import { NegotiationsController } from "./negotiation.controller";
import { NegotiationService } from "./negotiation.service";

/**
 * Importa PaymentPlanModule (y no al revés) a propósito: aprobar es lo que
 * materializa el plan, así que la dependencia va de la aprobación hacia la
 * creación. Quien propone acuerdos —agente y webhook de voz— importa este
 * módulo, y así no hay ciclo.
 */
@Module({
  imports: [PaymentPlanModule],
  controllers: [NegotiationsController],
  providers: [NegotiationService],
  exports: [NegotiationService]
})
export class NegotiationModule {}
