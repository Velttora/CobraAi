import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import type {
  WhatsAppPort,
  SendWhatsAppTemplateInput,
  SendWhatsAppTemplateResult
} from "@cobrai/ports";
import { PrismaService } from "@cobrai/db";

@Injectable()
export class TwilioWhatsAppAdapter implements WhatsAppPort {
  private readonly logger = new Logger(TwilioWhatsAppAdapter.name);
  private readonly client: ReturnType<typeof twilio> | null;
  /** Número compartido de fallback cuando el tenant no tiene su propio sender de WhatsApp. */
  private readonly defaultFrom: string | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    const accountSid = config.get<string>("TWILIO_ACCOUNT_SID");
    const authToken = config.get<string>("TWILIO_AUTH_TOKEN");
    const fromRaw =
      config.get<string>("TWILIO_WA_FROM") ??
      config.get<string>("TWILIO_FROM_NUMBER");

    this.defaultFrom = fromRaw
      ? fromRaw.startsWith("whatsapp:")
        ? fromRaw
        : `whatsapp:${fromRaw}`
      : null;

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
    } else {
      this.client = null;
      this.logger.warn(
        "Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN): WhatsApp en modo sandbox"
      );
    }
  }

  async sendTemplate(
    input: SendWhatsAppTemplateInput
  ): Promise<SendWhatsAppTemplateResult> {
    const from = await this.resolveFrom(input.tenant_id);

    if (!this.client || !from) {
      this.logger.warn(
        `WA sandbox: mensaje simulado a ${input.to} (template ${input.template_id})`
      );
      return { message_id: `sandbox-${randomUUID()}`, status: "sent" };
    }

    const to = input.to.startsWith("whatsapp:")
      ? input.to
      : `whatsapp:${input.to}`;

    const body = this.renderBody(input.template_id, input.variables);

    try {
      const msg = await this.client.messages.create({
        from,
        to,
        body
      });
      this.logger.log(`WA enviado SID=${msg.sid} to=${to} from=${from}`);
      return { message_id: msg.sid, status: "sent" };
    } catch (err: unknown) {
      this.logger.error(`WA fallido to=${to}: ${String(err)}`);
      return { message_id: "", status: "failed" };
    }
  }

  /**
   * Cada tenant puede tener su propio número de WhatsApp Business aprobado
   * (`settings.whatsappFromNumber`) — necesario cuando el mismo deudor le debe a
   * varios tenants, para que WhatsApp le muestre hilos separados por negocio. Si el
   * tenant no tiene número propio, cae al número compartido (sandbox/global).
   */
  private async resolveFrom(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    const settings = (tenant?.settings ?? {}) as {
      whatsappFromNumber?: unknown;
    };
    if (
      typeof settings.whatsappFromNumber === "string" &&
      settings.whatsappFromNumber
    ) {
      return settings.whatsappFromNumber;
    }
    return this.defaultFrom;
  }

  async isOptedIn(phone: string, tenant_id: string): Promise<boolean> {
    const consent = await this.prisma.contactConsent.findFirst({
      where: {
        tenantId: tenant_id,
        channel: "whatsapp",
        revokedAt: null,
        deletedAt: null
      }
    });
    return !!consent;
  }

  private renderBody(
    templateId: string,
    variables: Record<string, string>
  ): string {
    const nombre =
      variables.nombre ?? variables.debtor_name ?? "estimado cliente";
    const monto = variables.monto ?? variables.amount ?? "";
    const link = variables.link_pago ?? variables.link ?? "";
    const body = variables.body ?? "";
    const empresa = variables.empresa ?? "su gestor de cobranza";
    const resumenGrupo = variables.deudas_resumen_wa;

    // Si viene body pre-renderizado (desde agent response), usarlo directamente
    if (body) return body;

    // Agrupado: varias deudas del mismo deudor → resumen moderado (cantidad + total).
    if (resumenGrupo) {
      return `Hola ${nombre}, le recordamos de parte de ${empresa} que registra ${resumenGrupo}. Puede ponerse al día aquí: ${link}`;
    }

    if (templateId.includes("recordatorio")) {
      return `Hola ${nombre}, le recordamos que tiene un saldo pendiente de $${monto}. Puede pagarlo aquí: ${link}`;
    }
    if (templateId.includes("plan_pago")) {
      return `Hola ${nombre}, tenemos una propuesta de plan de pago para su saldo de $${monto}. Contáctenos para más información.`;
    }
    if (templateId.includes("confirmacion")) {
      return `Hola ${nombre}, confirmamos recepción de su pago. ¡Gracias!`;
    }
    return `Hola ${nombre}, le contactamos de ${empresa} sobre su cuenta. Saldo: $${monto}. Info: ${link}`;
  }
}
