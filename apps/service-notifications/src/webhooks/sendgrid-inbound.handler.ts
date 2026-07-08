import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import { KafkaService } from "../kafka/kafka.service";
import { ContactsService } from "../contacts/contacts.service";

export interface SendgridInboundPayload {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: string;
  envelope?: string;
  SPF?: string;
  spam_score?: string;
}

@Injectable()
export class SendgridInboundHandler {
  private readonly logger = new Logger(SendgridInboundHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService,
    private readonly contacts: ContactsService
  ) {}

  async handleInbound(payload: SendgridInboundPayload): Promise<void> {
    // 1. Validar forma + dominio destino
    if (!this.isValidPayload(payload)) return;

    // 2. Extraer email del deudor del campo from
    const emailMatch = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(payload.from ?? "");
    const email = emailMatch?.[0] ?? "";
    if (!email) return;

    // 3. Loop prevention — ignorar auto-replies y rebotes del propio sistema
    const rawHeaders = (payload.headers ?? "").toLowerCase();
    if (
      rawHeaders.includes("auto-submitted: auto") ||
      rawHeaders.includes("x-autoreply:") ||
      email.endsWith("@reply.fogging.org")
    ) {
      this.logger.log(`Auto-reply ignorado desde: ${email}`);
      return;
    }

    // 4. Obtener cuerpo limpio (fallback a html stripped si text vacío)
    const rawBody = payload.text?.trim() || stripHtmlTags(payload.html ?? "");
    const body = cleanEmailBody(rawBody);

    // 5. Detectar opt-out (español)
    if (/no\s+contactar|baja|unsubscribe|cancelar|stop|eliminar/i.test(body)) {
      await this.handleOptOut(email);
      return;
    }

    // 6. Buscar deudor por email
    const debtor = await this.prisma.debtor.findFirst({
      where: { email, deletedAt: null }
    });
    if (!debtor) {
      this.logger.warn(`Email inbound de dirección desconocida: ${email}`);
      return;
    }

    // 7. Upsert conversación de email
    const conversation = await this.upsertConversation(
      debtor.tenantId,
      debtor.id
    );

    // 8. Guardar mensaje inbound
    await this.prisma.message.create({
      data: {
        tenantId: debtor.tenantId,
        conversationId: conversation.id,
        direction: "in",
        channel: "email",
        content: JSON.stringify({ text: body, subject: payload.subject }),
        status: "delivered",
        sentAt: new Date()
      }
    });

    // 9. Actualizar lastMessageAt en la conversación
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });

    // 9b. Cualquier respuesta entrante cierra el intento de contacto pendiente como efectivo.
    await this.contacts.markResponse(debtor.tenantId, debtor.id, "effective", "email");

    // 10. Publicar evento Kafka para que el agente responda (Plan 04)
    // phone reutilizado para email address (compatibilidad con InboundMessagePayload)
    await this.kafka.publish(
      "cobrai.email.message_received",
      debtor.tenantId,
      {
        debtor_id: debtor.id,
        tenant_id: debtor.tenantId,
        conversation_id: conversation.id,
        phone: email, // phone reutilizado para email address
        body,
        channel: "email"
      }
    );

    this.logger.log(
      `Email inbound guardado y publicado en Kafka para deudor ${debtor.id}`
    );
  }

  private isValidPayload(payload: SendgridInboundPayload): boolean {
    if (!payload.from || (!payload.text && !payload.html)) return false;
    const to = payload.to ?? "";
    if (!to.includes("reply.fogging.org")) {
      this.logger.warn(`Email inbound con destino inesperado: ${to}`);
      return false;
    }
    return true;
  }

  private async handleOptOut(email: string): Promise<void> {
    const debtors = await this.prisma.debtor.findMany({
      where: { email, deletedAt: null }
    });
    if (debtors.length === 0) return;

    await this.prisma.contactConsent.updateMany({
      where: {
        debtorId: { in: debtors.map((d) => d.id) },
        channel: "email",
        revokedAt: null,
        deletedAt: null
      },
      data: { revokedAt: new Date() }
    });

    this.logger.log(`Opt-out email registrado para ${email}`);
  }

  private async upsertConversation(tenantId: string, debtorId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { tenantId, debtorId, channel: "email", deletedAt: null }
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        tenantId,
        debtorId,
        channel: "email",
        status: "open",
        lastMessageAt: new Date()
      }
    });
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000);
}

/**
 * Quita el historial citado y firmas de una respuesta de email, dejando solo el
 * texto nuevo. Robusto ante CRLF (Gmail) y encabezados de cita multi-línea
 * ("On <fecha>, <nombre> <email> wrote:" partido en varias líneas).
 */
function cleanEmailBody(text: string): string {
  // 1. Normalizar saltos de línea (Gmail/Outlook usan CRLF).
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let cutoff = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();

    // Marcadores de corte de una sola línea.
    if (
      line.startsWith(">") ||
      /^[-_]{2,}$/.test(line) ||
      // Cabeceras de cita estilo Outlook/Hotmail (EN/ES).
      /^(from|de|sent|enviado|reply-to|para|to|cc|asunto|subject):/i.test(line) ||
      // Separador "----- Original Message -----" / "Mensaje original" (Yahoo, Outlook clásico).
      /original message|mensaje original/i.test(line) ||
      // Firmas de cliente móvil.
      /^(sent from|enviado desde|obtén outlook|get outlook)/i.test(line)
    ) {
      cutoff = i;
      break;
    }

    // Encabezado de cita "On … wrote:" / "El … escribió:" / "Le … a las …:",
    // que Gmail suele partir en 2–3 líneas → mirar una ventana de 3 líneas.
    if (/^(on |el |le )/i.test(line)) {
      const block = lines.slice(i, i + 3).join(" ");
      if (/(wrote:|escribi(ó|o):|a las\b.*:|\bwrote\b|<[^>]+@[^>]+>)/i.test(block)) {
        cutoff = i;
        break;
      }
    }
  }

  const cleaned = (cutoff >= 0 ? lines.slice(0, cutoff) : lines).join("\n").trim();
  // Si la heurística dejó todo vacío (mensaje raro), devolver el texto original.
  return cleaned || text.trim();
}
