import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import { KafkaService } from "../kafka/kafka.service";
import { ContactsService } from "../contacts/contacts.service";

export interface TwilioWaInboundPayload {
  MessageSid: string;
  From: string; // whatsapp:+57...
  To: string; // whatsapp:+1415... (nuestro número)
  Body: string;
  ProfileName?: string;
  WaId?: string; // número sin prefijo whatsapp:
  NumMedia?: string;
  AccountSid: string;
}

@Injectable()
export class TwilioWaWebhookHandler {
  private readonly logger = new Logger(TwilioWaWebhookHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService,
    private readonly contacts: ContactsService
  ) {}

  async handleInbound(payload: TwilioWaInboundPayload): Promise<void> {
    const phone =
      payload.WaId ?? payload.From.replace("whatsapp:", "").replace("+", "");
    const body = payload.Body?.trim() ?? "";

    this.logger.log(`WA inbound de ${phone}: "${body.substring(0, 50)}"`);

    // Detectar STOP / opt-out
    if (/^(stop|para|detener|cancelar|baja|no más|no mas)$/i.test(body)) {
      await this.handleOptOut(phone);
      return;
    }

    // Buscar deudor por teléfono (raw query para buscar en array JSON)
    const debtor = await this.findDebtorByPhone(phone);
    if (!debtor) {
      this.logger.warn(`WA inbound de número desconocido: ${phone}`);
      return;
    }

    // Encontrar o crear conversación activa
    const conversation = await this.upsertConversation(
      debtor.tenantId,
      debtor.id
    );

    // Guardar mensaje inbound en BD
    await this.prisma.message.create({
      data: {
        tenantId: debtor.tenantId,
        conversationId: conversation.id,
        direction: "in",
        channel: "whatsapp",
        content: JSON.stringify({
          text: body,
          messageSid: payload.MessageSid
        }),
        status: "delivered",
        sentAt: new Date()
      }
    });

    // Actualizar lastMessageAt
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });

    // Cualquier respuesta entrante cierra el intento de contacto pendiente como efectivo.
    await this.contacts.markResponse(debtor.tenantId, debtor.id, "effective", "whatsapp");

    // Publicar evento para que el agente LLM responda (Phase 3)
    await this.kafka.publish(
      "cobrai.whatsapp.message_received",
      debtor.tenantId,
      {
        debtor_id: debtor.id,
        tenant_id: debtor.tenantId,
        conversation_id: conversation.id,
        phone,
        body,
        message_sid: payload.MessageSid
      }
    );

    this.logger.log(
      `WA inbound guardado y publicado en Kafka para deudor ${debtor.id}`
    );
  }

  private async handleOptOut(phone: string): Promise<void> {
    // Buscar deudores con este teléfono y revocar consents de WA
    const debtors = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM debtors
      WHERE deleted_at IS NULL
      AND phones::text LIKE ${`%${phone}%`}
    `;

    if (debtors.length === 0) return;

    await this.prisma.contactConsent.updateMany({
      where: {
        debtorId: { in: debtors.map((d: { id: string }) => d.id) },
        channel: "whatsapp",
        revokedAt: null,
        deletedAt: null
      },
      data: { revokedAt: new Date() }
    });

    this.logger.log(`Opt-out WA registrado para ${phone}`);
  }

  /**
   * El mismo teléfono puede existir en deudores de tenants distintos (el número de
   * WhatsApp del sandbox/cuenta es compartido y no trae contexto de tenant). Para
   * desambiguar, prioriza al deudor con un contacto "pending" (esperando su
   * respuesta) — es la señal más fuerte de a quién le está respondiendo el deudor.
   * Si ninguno tiene un contacto pendiente, usa el deudor actualizado más reciente.
   */
  private async findDebtorByPhone(phone: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; tenant_id: string }>
    >`
      SELECT d.id, d.tenant_id FROM debtors d
      WHERE d.deleted_at IS NULL
      AND d.phones::text LIKE ${`%${phone}%`}
      ORDER BY
        EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.debtor_id = d.id
          AND c.deleted_at IS NULL
          AND c.response_status = 'pending'
        ) DESC,
        d.updated_at DESC
      LIMIT 1
    `;

    if (!rows[0]) return null;

    return this.prisma.debtor.findUnique({
      where: { id: rows[0].id }
    });
  }

  private async upsertConversation(tenantId: string, debtorId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { tenantId, debtorId, channel: "whatsapp", deletedAt: null }
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        tenantId,
        debtorId,
        channel: "whatsapp",
        status: "open",
        lastMessageAt: new Date()
      }
    });
  }
}
