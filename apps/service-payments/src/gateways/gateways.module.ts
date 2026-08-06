import { Module } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import { GatewayService } from "./gateway.service";
import { StripeGateway } from "./stripe.gateway";
import { MercadoPagoGateway } from "./mercadopago.gateway";
import { WompiGateway } from "./wompi.gateway";
import { PayuGateway } from "./payu.gateway";
import { EpaycoGateway } from "./epayco.gateway";
import { ExternalLinkGateway } from "./external-link.gateway";
import { TransferGateway } from "./transfer.gateway";

// D-06/D-12: the seven BYO gateway adapters registered here (five API-backed
// plus external_link/transfer) are wired into dispatch by GatewayService,
// keyed by the tenant's own configured PaymentProvider.
const GATEWAY_ADAPTERS = [
  StripeGateway,
  MercadoPagoGateway,
  WompiGateway,
  PayuGateway,
  EpaycoGateway,
  ExternalLinkGateway,
  TransferGateway
];

@Module({
  providers: [
    GatewayService,
    ...GATEWAY_ADAPTERS,
    // Factory provider follows apps/service-notifications/src/compliance/compliance.module.ts:
    // a plain class with no NestJS dependency, wired per-app with PrismaService.
    {
      provide: TenantIntegrationService,
      useFactory: (prisma: PrismaService) => new TenantIntegrationService(prisma),
      inject: [PrismaService]
    }
  ],
  exports: [GatewayService, ...GATEWAY_ADAPTERS, TenantIntegrationService]
})
export class GatewaysModule {}
