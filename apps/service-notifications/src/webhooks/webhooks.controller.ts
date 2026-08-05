import { Body, Controller, Headers, HttpCode, Param, Post, UseInterceptors } from "@nestjs/common";
import { NoFilesInterceptor } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "@cobrai/compliance";
import { TenantIntegrationService } from "@cobrai/integrations";
import { successResponse } from "../common/utils/api.utils";
import { WebhooksService } from "./webhooks.service";
import { TwilioWaWebhookHandler } from "./twilio-wa-webhook.handler";
import { VapiWebhookHandler, type VapiWebhookPayload } from "./vapi-webhook.handler";
import { SendgridInboundHandler } from "./sendgrid-inbound.handler";
import { assertTwilioSignature, resolveWebhookIntegration } from "./integration-webhook-token.guard";

@Controller("v1/webhooks")
export class WebhooksController {
  /**
   * Base used to reconstruct the exact URL Twilio signs its requests
   * against — must match `PUBLIC_WEBHOOK_BASE_URL` plus provider/token,
   * the same shape `TenantIntegrationService.toView` builds and plan
   * 08-07's `WhatsAppConnectService` registered through the Senders API.
   */
  private readonly baseWebhookUrl: string;

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly twilioWaHandler: TwilioWaWebhookHandler,
    private readonly vapiHandler: VapiWebhookHandler,
    private readonly sendgridInboundHandler: SendgridInboundHandler,
    private readonly integrations: TenantIntegrationService,
    private readonly audit: AuditService,
    config: ConfigService
  ) {
    this.baseWebhookUrl = config.get<string>("PUBLIC_WEBHOOK_BASE_URL") ?? "";
  }

  @Post("sendgrid")
  async sendgrid(@Body() body: unknown) {
    const events = Array.isArray(body) ? body : [body];
    await this.webhooksService.handleSendGrid(events);
    return successResponse({ received: events.length });
  }

  @Post("twilio")
  async twilio(@Body() body: Record<string, string>) {
    await this.webhooksService.handleTwilio(body);
    return successResponse({ received: true });
  }

  /**
   * Webhook de Twilio para mensajes entrantes de WhatsApp, enrutado por el
   * token opaco de la integración (D-19) — el token resuelve al tenant
   * ANTES de validar la firma, y la firma se verifica en todo ambiente
   * (D-20, fail-closed). El segmento de path usa el valor literal del enum
   * `IntegrationProvider` ("twilio_whatsapp"), porque es exactamente la URL
   * que `TenantIntegrationService.toView` construye y que el plan 08-07
   * registró contra la Senders API de Twilio — cualquier otra forma de path
   * haría que Twilio le pegara a una URL que nadie escucha.
   */
  @Post("twilio_whatsapp/:token")
  @HttpCode(200)
  async twilioWhatsApp(
    @Param("token") token: string,
    @Body() body: Record<string, string>,
    @Headers("x-twilio-signature") signature: string | undefined
  ) {
    const integration = await resolveWebhookIntegration(this.integrations, "twilio_whatsapp", token);
    const webhookUrl = `${this.baseWebhookUrl}/twilio_whatsapp/${token}`;
    await assertTwilioSignature({ integration, webhookUrl, params: body, signature, audit: this.audit });

    await this.twilioWaHandler.handleInbound(integration.tenantId, body as never);
    // Twilio espera respuesta vacía 200 (o TwiML vacío)
    return "";
  }

  /**
   * Webhook de Vapi.ai para eventos de llamada (end-of-call-report, transcript, etc.)
   */
  @Post("vapi")
  @HttpCode(200)
  async vapiWebhook(@Body() body: VapiWebhookPayload) {
    if (body.message?.type === "end-of-call-report") {
      await this.vapiHandler.handleEndOfCall(body);
    }
    return { received: true };
  }

  /**
   * Webhook de SendGrid Inbound Parse para emails entrantes del deudor,
   * enrutado por el token opaco de la integración (D-19). SendGrid Inbound
   * Parse no firma sus requests — el token es la única autenticación de
   * este endpoint, por eso no hay un `assertTwilioSignature`-equivalente
   * aquí. El path usa el valor literal del provider ("sendgrid"), igual
   * que `twilio_whatsapp` arriba, para coincidir con la URL que
   * `TenantIntegrationService.toView` expone al tenant (plan 08-11).
   * SendGrid envía multipart/form-data — NoFilesInterceptor activa multer para poblar @Body.
   * Body tipado como Record<string,string> para evitar que forbidNonWhitelisted rechace
   * los campos extra de SendGrid (charsets, attachment-info, etc.).
   */
  @Post("sendgrid/:token")
  @HttpCode(200)
  @UseInterceptors(NoFilesInterceptor())
  async sendgridInbound(
    @Param("token") token: string,
    @Body() body: Record<string, string>
  ): Promise<string> {
    const integration = await resolveWebhookIntegration(this.integrations, "sendgrid", token);
    const replyDomain = integration.publicConfig["replyDomain"] ?? "";
    await this.sendgridInboundHandler.handleInbound(integration.tenantId, replyDomain, body as never);
    // SendGrid espera respuesta 200 vacía
    return "";
  }
}
