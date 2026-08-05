import { BadRequestException, Injectable } from "@nestjs/common";
import type { PaymentProvider } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import type { CheckoutSession, GatewayAdapter } from "./gateway.types";
import { StripeGateway } from "./stripe.gateway";
import { MercadoPagoGateway } from "./mercadopago.gateway";
import { WompiGateway } from "./wompi.gateway";
import { PayuGateway } from "./payu.gateway";
import { EpaycoGateway } from "./epayco.gateway";
import { ExternalLinkGateway } from "./external-link.gateway";
import { TransferGateway } from "./transfer.gateway";

export type { CheckoutSession } from "./gateway.types";

export interface CreateCheckoutRequest {
  tenantId: string;
  amount: number;
  currency: string;
  token: string;
  debtorName: string;
  returnUrl: string;
}

/**
 * Dispatches checkout creation to the `GatewayAdapter` matching the tenant's
 * own configured `PaymentProvider` (D-06/D-12). Under BYO there is no
 * platform-level gateway and no fallback: a tenant with no verified payments
 * integration cannot create a checkout at all — replaces the legacy
 * platform-config-driven branching this file used to have.
 */
@Injectable()
export class GatewayService {
  private readonly adapters: Map<PaymentProvider, GatewayAdapter>;

  constructor(
    private readonly tenantIntegrations: TenantIntegrationService,
    stripe: StripeGateway,
    mercadopago: MercadoPagoGateway,
    wompi: WompiGateway,
    payu: PayuGateway,
    epayco: EpaycoGateway,
    externalLink: ExternalLinkGateway,
    transfer: TransferGateway
  ) {
    const registered: GatewayAdapter[] = [stripe, mercadopago, wompi, payu, epayco, externalLink, transfer];
    this.adapters = new Map(registered.map((adapter) => [adapter.provider, adapter]));
  }

  async createCheckout(input: CreateCheckoutRequest): Promise<CheckoutSession> {
    const integration = await this.tenantIntegrations.resolveByChannel(input.tenantId, "payments");
    if (!integration) {
      throw new BadRequestException("La organización no tiene un método de cobro configurado");
    }

    // `resolveByChannel(tenantId, "payments")` only ever returns a provider
    // from CHANNEL_PROVIDERS.payments (a strict subset of PaymentProvider's
    // values), but its return type is the broader IntegrationProvider union
    // shared across channels — narrow here rather than widen `adapters`.
    const adapter = this.adapters.get(integration.provider as PaymentProvider);
    if (!adapter) {
      throw new BadRequestException(`No hay un adaptador de pago para ${integration.provider}`);
    }

    return adapter.createCheckout({
      amount: input.amount,
      currency: input.currency,
      token: input.token,
      debtorName: input.debtorName,
      returnUrl: input.returnUrl,
      publicConfig: integration.publicConfig,
      secrets: integration.secrets
    });
  }
}
