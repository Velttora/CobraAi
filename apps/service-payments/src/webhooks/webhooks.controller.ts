import { Controller, HttpCode, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";
import type { Request } from "express";
import type { PaymentProvider } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import { successResponse } from "../common/utils/api.utils";
import { WEBHOOK_UNAUTHORIZED_MESSAGE, WebhookValidatorService, type WebhookPaymentProvider } from "./webhook-validator.service";
import { WebhooksService } from "./webhooks.service";

/** The five payment providers that confirm via webhook (D-19/D-14). `external_link`/`transfer` have no webhook. */
const WEBHOOK_PROVIDERS: WebhookPaymentProvider[] = ["stripe", "mercadopago", "wompi", "payu", "epayco"];

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

@Controller("v1/webhooks")
export class WebhooksController {
  constructor(
    private readonly tenantIntegrations: TenantIntegrationService,
    private readonly validator: WebhookValidatorService,
    private readonly webhooks: WebhooksService
  ) {}

  @Post(":provider/:token")
  @HttpCode(200)
  async handle(
    @Param("provider") providerParam: string,
    @Param("token") token: string,
    @Req() req: RawBodyRequest<Request>
  ) {
    // D-19: unknown provider, unknown token and bad signature must all be
    // indistinguishable to the caller, so a scanning/forged request can
    // never learn whether a given token or tenant exists (T-08-07b). Every
    // rejection below — here and inside WebhookValidatorService.verify —
    // throws this exact same UnauthorizedException.
    if (!WEBHOOK_PROVIDERS.includes(providerParam as WebhookPaymentProvider)) {
      throw new UnauthorizedException(WEBHOOK_UNAUTHORIZED_MESSAGE);
    }
    const provider = providerParam as PaymentProvider;

    // Resolved BEFORE any signature check (D-19) — the signing secret to
    // verify against belongs to this specific integration, not the URL's
    // provider segment alone. Not gated on `status` (see
    // TenantIntegrationService.resolveByWebhookToken's own doc comment), so
    // "no secret yet" and "wrong secret" both flow into the same fail-closed
    // path in WebhookValidatorService rather than being conflated here.
    const integration = await this.tenantIntegrations.resolveByWebhookToken(token);
    if (!integration || integration.provider !== provider) {
      throw new UnauthorizedException(WEBHOOK_UNAUTHORIZED_MESSAGE);
    }

    const rawBody = req.rawBody?.toString("utf8") ?? "";
    await this.validator.verify({
      provider,
      integration,
      rawBody,
      headers: normalizeHeaders(req.headers)
    });

    await this.webhooks.handle(integration, rawBody);
    return successResponse({ received: true });
  }
}
