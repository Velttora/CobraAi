import { Body, Controller, ForbiddenException, Headers, HttpCode, Post, UseInterceptors } from "@nestjs/common";
import { NoFilesInterceptor } from "@nestjs/platform-express";
import { successResponse } from "../common/utils/api.utils";
import { WebhooksService } from "./webhooks.service";
import { TwilioWaWebhookHandler } from "./twilio-wa-webhook.handler";
import { validateTwilioSignature } from "./twilio-signature.validator";
import { VapiWebhookHandler, type VapiWebhookPayload } from "./vapi-webhook.handler";
import { SendgridInboundHandler } from "./sendgrid-inbound.handler";

@Controller("v1/webhooks")
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly twilioWaHandler: TwilioWaWebhookHandler,
    private readonly vapiHandler: VapiWebhookHandler,
    private readonly sendgridInboundHandler: SendgridInboundHandler
  ) {}

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

  @Post("whatsapp")
  async whatsapp(@Body() body: Record<string, unknown>) {
    await this.webhooksService.handleWhatsApp(body);
    return successResponse({ received: true });
  }

  /**
   * Webhook de Twilio para mensajes entrantes de WhatsApp.
   * Twilio firma cada request con X-Twilio-Signature.
   */
  @Post("twilio-whatsapp")
  @HttpCode(200)
  async twilioWhatsApp(
    @Body() body: Record<string, string>,
    @Headers("x-twilio-signature") signature: string
  ) {
    if (process.env["NODE_ENV"] === "production") {
      const authToken = process.env["TWILIO_AUTH_TOKEN"] ?? "";
      const webhookUrl = process.env["TWILIO_WA_WEBHOOK_URL"] ?? "";
      const valid = validateTwilioSignature(authToken, webhookUrl, body, signature);
      if (!valid) throw new ForbiddenException("Firma Twilio inválida");
    }

    await this.twilioWaHandler.handleInbound(body as never);
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
   * Webhook de SendGrid Inbound Parse para emails entrantes del deudor.
   * SendGrid envía multipart/form-data — NoFilesInterceptor activa multer para poblar @Body.
   * Body tipado como Record<string,string> para evitar que forbidNonWhitelisted rechace
   * los campos extra de SendGrid (charsets, attachment-info, etc.).
   */
  @Post("sendgrid-inbound")
  @HttpCode(200)
  @UseInterceptors(NoFilesInterceptor())
  async sendgridInbound(
    @Body() body: Record<string, string>
  ): Promise<string> {
    await this.sendgridInboundHandler.handleInbound(body as never);
    // SendGrid espera respuesta 200 vacía
    return "";
  }
}
