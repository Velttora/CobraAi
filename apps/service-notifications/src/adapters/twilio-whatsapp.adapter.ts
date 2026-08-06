import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import type {
  WhatsAppPort,
  SendWhatsAppTemplateInput,
  SendWhatsAppTemplateResult
} from "@cobrai/ports";
import { PrismaService } from "@cobrai/db";
import { TenantIntegrationService } from "@cobrai/integrations";
import { EMPRESA_FALLBACK } from "@cobrai/utils";
import { isSimulationEnabled } from "./simulation.guard";

@Injectable()
export class TwilioWhatsAppAdapter implements WhatsAppPort {
  private readonly logger = new Logger(TwilioWhatsAppAdapter.name);

  constructor(
    private readonly integrations: TenantIntegrationService,
    private readonly prisma: PrismaService
  ) {}

  async sendTemplate(
    input: SendWhatsAppTemplateInput
  ): Promise<SendWhatsAppTemplateResult> {
    const integration = await this.integrations.resolveByChannel(input.tenant_id, "whatsapp");

    if (!integration) {
      // D-17: the previous unconditional "simulate and report success" behaviour
      // here is exactly the phantom-send pattern this plan removes — under BYO,
      // a missing tenant credential must be a real failure unless simulation is
      // explicitly enabled (and the boot guard refuses to start with it enabled
      // in production).
      if (isSimulationEnabled()) {
        this.logger.warn(
          `WA sandbox: mensaje simulado a ${input.to} (template ${input.template_id}, tenant ${input.tenant_id})`
        );
        return { message_id: `sandbox-${randomUUID()}`, status: "sent", simulated: true };
      }
      this.logger.error(
        `WA sin integración de WhatsApp verificada para tenant ${input.tenant_id}: envío rechazado (to=${input.to})`
      );
      return { message_id: "", status: "failed" };
    }

    // Cada tenant tiene su propia subcuenta/credenciales de Twilio (D-01/D-02) —
    // el cliente se construye por request, nunca cacheado, para que rotar la
    // credencial de un tenant tenga efecto sin reiniciar el servicio.
    const client = twilio(integration.secrets.accountSid, integration.secrets.authToken);
    const fromRaw = integration.publicConfig.fromNumber;
    const from = fromRaw?.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`;

    const to = input.to.startsWith("whatsapp:")
      ? input.to
      : `whatsapp:${input.to}`;

    const body = this.renderBody(input.template_id, input.variables);

    try {
      const msg = await client.messages.create({
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
    const empresa = variables.empresa ?? EMPRESA_FALLBACK;
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
