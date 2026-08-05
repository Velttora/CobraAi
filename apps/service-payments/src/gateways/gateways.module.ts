import { Module } from "@nestjs/common";
import { GatewayService } from "./gateway.service";
import { StripeGateway } from "./stripe.gateway";
import { MercadoPagoGateway } from "./mercadopago.gateway";

// D-06/D-12: the BYO gateway adapters registered here are wired into
// dispatch by plan 08-09 — this module only makes them injectable.
const GATEWAY_ADAPTERS = [StripeGateway, MercadoPagoGateway];

@Module({
  providers: [GatewayService, ...GATEWAY_ADAPTERS],
  exports: [GatewayService, ...GATEWAY_ADAPTERS]
})
export class GatewaysModule {}
