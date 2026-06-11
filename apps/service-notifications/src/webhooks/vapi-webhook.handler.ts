import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService, type ContactChannel } from "@cobrai/db";
import { ComplianceService } from "@cobrai/compliance";
import { KafkaService } from "../kafka/kafka.service";
import { TwilioWhatsAppAdapter } from "../adapters/twilio-whatsapp.adapter";
import { EmailAdapter } from "../adapters/email.adapter";
import { DebtorMemoryService } from "../memory/debtor-memory.service";

type ContactOutcome =
  | "promise_made"
  | "payment_received"
  | "no_answer"
  | "refused"
  | "voicemail"
  | "wrong_number"
  | "callback_requested";

/** Datos estructurados que Vapi extrae de la llamada (analysisPlan.structuredDataPlan). */
export interface VapiStructuredData {
  intent?: string;
  promised?: boolean;
  promise_date?: string;          // ISO YYYY-MM-DD calculado por Vapi
  promise_timeframe_text?: string; // texto literal: "el siguiente mes"
  promise_amount?: number;
}

export interface VapiWebhookPayload {
  message: {
    type: "end-of-call-report" | "status-update" | "transcript";
    call: {
      id: string;
      status: string;
      startedAt?: string;
      endedAt?: string;
      metadata?: {
        debt_id?: string;
        tenant_id?: string;
        strategy_id?: string;
      };
      endedReason?: string;
    };
    transcript?: string;
    summary?: string;
    analysis?: {
      successEvaluation?: string; // 'true' | 'false'
      structuredData?: VapiStructuredData;
    };
  };
}

@Injectable()
export class VapiWebhookHandler {
  private readonly logger = new Logger(VapiWebhookHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService,
    private readonly whatsapp: TwilioWhatsAppAdapter,
    private readonly email: EmailAdapter,
    private readonly compliance: ComplianceService,
    private readonly config: ConfigService,
    private readonly debtorMemory: DebtorMemoryService,
  ) {}

  async handleEndOfCall(payload: VapiWebhookPayload): Promise<void> {
    const { call, transcript, summary, analysis } = payload.message;
    const meta = call.metadata ?? {};
    const debtId = meta.debt_id;
    const tenantId = meta.tenant_id;

    if (!debtId || !tenantId) {
      this.logger.warn(`Webhook Vapi sin metadata: call_id=${call.id}`);
      return;
    }

    const durationSecs =
      call.startedAt && call.endedAt
        ? Math.round(
            (new Date(call.endedAt).getTime() -
              new Date(call.startedAt).getTime()) /
              1000,
          )
        : null;

    const outcome = this.mapOutcome(call.endedReason, analysis);
    const successEval = analysis?.successEvaluation === "true";

    // 1. Actualizar contact record (el último contact de voz in_progress o scheduled para esta deuda)
    const updated = await this.prisma.contact.updateMany({
      where: {
        tenantId,
        debtId,
        channel: "voice",
        status: { in: ["in_progress", "scheduled"] },
      },
      data: {
        status: "completed",
        outcome,
        transcriptUrl: null, // transcript guardado inline en messages
        durationSeconds: durationSecs,
        endedAt: call.endedAt ? new Date(call.endedAt) : new Date(),
      },
    });

    // Resolver el id del contact recién cerrado (updateMany no devuelve ids — Landmine 1).
    // Si no existía un contact previo (llamada disparada fuera de executeContact),
    // crear uno para que la llamada aparezca en /calls (lee de la tabla contacts).
    let closedContact: { id: string } | null = null;
    if (updated.count > 0) {
      closedContact = await this.prisma.contact.findFirst({
        where: { tenantId, debtId, channel: "voice", status: "completed" },
        orderBy: { endedAt: "desc" },
        select: { id: true },
      });
    } else {
      const debtRow = await this.prisma.debt.findFirst({
        where: { id: debtId, tenantId },
        select: { debtorId: true },
      });
      if (debtRow) {
        closedContact = await this.prisma.contact.create({
          data: {
            tenantId,
            debtId,
            debtorId: debtRow.debtorId,
            channel: "voice",
            status: "completed",
            outcome,
            durationSeconds: durationSecs,
            startedAt: call.startedAt ? new Date(call.startedAt) : new Date(),
            endedAt: call.endedAt ? new Date(call.endedAt) : new Date(),
          },
          select: { id: true },
        });
      }
    }

    // 2. Guardar transcript en tabla messages si llega; capturar debtorId para refreshMemory
    let debtorId: string | null = null;
    if (transcript) {
      debtorId = await this.saveTranscript(
        tenantId,
        debtId,
        call.id,
        transcript,
        summary,
      );
    }

    // 3. Refrescar memoria del deudor — nunca bloquea el webhook (Landmine 2)
    if (debtorId) {
      try {
        await this.debtorMemory.refreshMemory(
          tenantId,
          debtorId,
          closedContact?.id ?? undefined,
        );
      } catch (err) {
        this.logger.error(
          `refreshMemory failed for debt ${debtId}: ${String(err)}`,
        );
      }
    }

    // 4. Si hubo promesa de pago → registrar promesa y entregar link por el
    //    canal configurado (WhatsApp si está habilitado, si no email).
    if (outcome === "promise_made") {
      await this.registerPromiseFromCall(tenantId, debtId, analysis?.structuredData);
      await this.deliverPaymentLink(tenantId, debtId);
    }

    // 5. Publicar cobrai.voice.call_completed
    await this.kafka.publish("cobrai.voice.call_completed", tenantId, {
      call_id: call.id,
      debt_id: debtId,
      tenant_id: tenantId,
      outcome,
      success: successEval,
      duration_seconds: durationSecs,
      transcript: transcript ?? null,
      summary: summary ?? null,
      ended_reason: call.endedReason,
    });

    this.logger.log(
      `Llamada Vapi ${call.id} completada: outcome=${outcome} success=${successEval}`,
    );
  }

  private mapOutcome(
    endedReason?: string,
    analysis?: VapiWebhookPayload["message"]["analysis"],
  ): ContactOutcome {
    // Casos sin conversación: el motivo de fin manda (no hay nada que analizar).
    switch (endedReason) {
      case "customer-did-not-answer":
        return "no_answer";
      case "voicemail":
        return "voicemail";
      case "error":
        return "no_answer"; // fallo técnico
    }

    // Hubo conversación: lo que el deudor dijo (structuredData) gana sobre quién colgó.
    // Así, si promete pagar y luego cuelga él, se registra como promesa, no como rechazo.
    const sd = analysis?.structuredData;
    if (sd?.promised === true) return "promise_made";
    if (sd?.intent) {
      switch (sd.intent) {
        case "promise_to_pay":
          return "promise_made";
        case "payment_confirmed":
          return "payment_received";
        case "plan_request":
          return sd.promise_date ? "promise_made" : "callback_requested";
        case "callback_requested":
          return "callback_requested";
        case "dispute":
        case "opt_out":
        case "refused":
        case "no_commitment":
          return "refused";
      }
    }

    // Fallback sin datos estructurados: usa el motivo de fin.
    if (!endedReason) return "no_answer";
    switch (endedReason) {
      case "customer-ended-call":
        return "refused"; // colgó sin que se detectara promesa
      case "assistant-ended-call":
        return analysis?.successEvaluation === "true"
          ? "promise_made"
          : "refused";
      case "line-busy":
        return "refused"; // no hay "busy" en ContactOutcome; lo mapeamos a refused
      default:
        return "refused";
    }
  }

  /**
   * Registra la promesa de pago detectada en la llamada: crea PromiseToPay,
   * marca la deuda como "promised" y publica el evento. Esto conecta lo que el
   * deudor dijo por voz ("el siguiente mes") con el resto del sistema.
   */
  private async registerPromiseFromCall(
    tenantId: string,
    debtId: string,
    structuredData?: VapiStructuredData,
  ): Promise<void> {
    const promisedDate = this.resolvePromiseDate(structuredData);
    const exactDate = this.hasExactDate(structuredData);

    // Monto: el que prometió, o el saldo total si no especificó uno distinto.
    let amount = structuredData?.promise_amount ?? 0;
    if (!amount || amount <= 0) {
      const debt = await this.prisma.debt.findFirst({
        where: { id: debtId, tenantId },
        select: { amountOutstanding: true },
      });
      amount = debt ? Number(debt.amountOutstanding) : 0;
    }

    // Guardar el texto literal del deudor ("próximo mes") para trazabilidad:
    // si la fecha es aproximada, un operador puede ver qué dijo exactamente.
    const timeframe = structuredData?.promise_timeframe_text?.trim();
    const notes = this.buildPromiseNotes(timeframe, exactDate);

    // No duplicar si ya hay una promesa pendiente para esta deuda.
    const existing = await this.prisma.promiseToPay.findFirst({
      where: { debtId, tenantId, status: "pending", deletedAt: null },
    });
    if (existing) {
      await this.prisma.promiseToPay.update({
        where: { id: existing.id },
        data: { amount, promisedDate, notes },
      });
    } else {
      await this.prisma.promiseToPay.create({
        data: { tenantId, debtId, amount, promisedDate, status: "pending", notes },
      });
    }

    await this.prisma.debt.updateMany({
      where: { id: debtId, tenantId },
      data: { status: "promised" },
    });

    await this.kafka.publish("cobrai.debt.promise_registered", tenantId, {
      debt_id: debtId,
      channel: "voice",
      promise_date: promisedDate.toISOString().slice(0, 10),
      promise_amount: amount,
    });

    this.logger.log(
      `Promesa de pago registrada desde llamada: debt=${debtId} ` +
        `fecha=${promisedDate.toISOString().slice(0, 10)} monto=${amount} ` +
        `(dijo: "${structuredData?.promise_timeframe_text ?? "—"}")`,
    );
  }

  /**
   * Parsea la fecha ISO que Vapi calculó a partir de lo que dijo el deudor.
   * Devuelve null si falta, es inválida o está en el pasado (más de un día).
   */
  private parseVapiDate(structuredData?: VapiStructuredData): Date | null {
    const raw = structuredData?.promise_date?.trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (isNaN(parsed.getTime()) || parsed.getTime() <= Date.now() - 86_400_000) {
      return null;
    }
    return parsed;
  }

  /** true si Vapi logró calcular una fecha exacta (no caímos al fallback). */
  private hasExactDate(structuredData?: VapiStructuredData): boolean {
    return this.parseVapiDate(structuredData) !== null;
  }

  /**
   * Resuelve la fecha de promesa. Usa la fecha que Vapi calculó; si falta o es
   * inválida/pasada, cae a +1 mes (cubre el caso típico "el siguiente mes").
   */
  private resolvePromiseDate(structuredData?: VapiStructuredData): Date {
    const exact = this.parseVapiDate(structuredData);
    if (exact) return exact;
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + 1);
    return fallback;
  }

  /**
   * Construye la nota de la promesa con el texto literal del deudor. Cuando la
   * fecha es estimada (Vapi no la calculó), lo marca para revisión manual.
   */
  private buildPromiseNotes(timeframe: string | undefined, exactDate: boolean): string {
    if (!timeframe) {
      return exactDate
        ? "Promesa registrada por llamada de voz."
        : "Promesa por llamada de voz — sin fecha clara, estimada a +1 mes (revisar).";
    }
    return exactDate
      ? `Promesa por llamada de voz — el deudor dijo: "${timeframe}".`
      : `Promesa por llamada de voz — el deudor dijo: "${timeframe}" — fecha estimada a +1 mes (revisar).`;
  }

  /**
   * Entrega el enlace de pago por el canal que la configuración del deudor
   * permita. No asume WhatsApp: prueba los canales de texto en orden de
   * preferencia (bestChannel → WhatsApp → email) y usa el primero que esté
   * habilitado (opt-in/consentimiento/sin opt-out). Si ninguno es elegible,
   * publica un evento para que el sistema lo resuelva por otra vía.
   */
  private async deliverPaymentLink(tenantId: string, debtId: string): Promise<void> {
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId },
      select: {
        amountOutstanding: true,
        debtor: {
          select: {
            id: true,
            name: true,
            phones: true,
            email: true,
            bestChannel: true,
          },
        },
      },
    });
    if (!debt) return;

    const baseUrl =
      this.config.get<string>("PAYMENT_LINK_BASE_URL") ?? "https://cobrai.app/pay";
    const link = `${baseUrl}/${debtId}`;
    const monto = Number(debt.amountOutstanding).toLocaleString("es-CO");
    const nombre = debt.debtor.name.split(" ")[0] ?? "cliente";
    const phones = (debt.debtor.phones ?? []) as string[];
    const phone = phones[0];
    const email = debt.debtor.email;

    const candidates = this.paymentLinkChannelOrder(
      debt.debtor.bestChannel,
      phone,
      email,
    );

    for (const channel of candidates) {
      const eligible = await this.compliance.isChannelEligible({
        tenantId,
        debtorId: debt.debtor.id,
        channel,
      });
      if (!eligible.allowed) {
        this.logger.debug(
          `Canal ${channel} no habilitado para link de pago (deuda ${debtId}): ${eligible.reason}`,
        );
        continue;
      }

      if (channel === "whatsapp" && phone) {
        await this.whatsapp.sendTemplate({
          to: `+${phone}`,
          tenant_id: tenantId,
          template_id: "link_pago",
          variables: {
            nombre,
            monto,
            link_pago: link,
            body: `Hola ${nombre}, gracias por su compromiso de pago 🙏. Aquí le enviamos el enlace para realizar su pago de $${monto} COP:\n\n${link}\n\nCualquier duda estamos a su disposición.`,
          },
        });
        this.logger.log(`Link de pago enviado por WhatsApp a ${phone} (deuda ${debtId})`);
        return;
      }

      if (channel === "email" && email) {
        await this.email.sendTemplate({
          to: email,
          template_id: "link_pago",
          tenant_id: tenantId,
          variables: {
            nombre,
            monto,
            link_pago: link,
            subject: "Enlace de pago — CobraAI",
            body: `Hola ${nombre},\n\nGracias por su compromiso de pago. Aquí está el enlace para realizar su pago de $${monto} COP:\n\n${link}\n\nCualquier duda estamos a su disposición.`,
          },
        });
        this.logger.log(`Link de pago enviado por email a ${email} (deuda ${debtId})`);
        return;
      }
    }

    // Ningún canal de texto habilitado: no se pudo entregar el enlace.
    this.logger.warn(
      `No se pudo entregar el link de pago para deuda ${debtId}: sin canal elegible`,
    );
    await this.kafka.publish("cobrai.payment_link.delivery_failed", tenantId, {
      debt_id: debtId,
      reason: "no_eligible_channel",
    });
  }

  /**
   * Orden de canales de texto para entregar un enlace, según preferencia del
   * deudor (bestChannel) y disponibilidad de dato de contacto. SMS queda fuera
   * mientras FEATURE_SMS_ENABLED esté apagado.
   */
  private paymentLinkChannelOrder(
    bestChannel: ContactChannel | null,
    phone?: string,
    email?: string | null,
  ): ContactChannel[] {
    const order: ContactChannel[] = [];
    const add = (c: ContactChannel) => {
      if (order.includes(c)) return;
      if (c === "whatsapp" && phone) order.push(c);
      else if (c === "email" && email) order.push(c);
    };
    if (bestChannel === "whatsapp" || bestChannel === "email") add(bestChannel);
    add("whatsapp");
    add("email");
    return order;
  }

  private async saveTranscript(
    tenantId: string,
    debtId: string,
    callId: string,
    transcript: string,
    summary?: string,
  ): Promise<string | null> {
    // Buscar deudor de la deuda
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId },
      select: { debtorId: true },
    });
    if (!debt) return null;

    // Buscar o crear conversación de voz
    let conv = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        debtorId: debt.debtorId,
        channel: "voice",
        deletedAt: null,
      },
    });
    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: {
          tenantId,
          debtorId: debt.debtorId,
          debtId,
          channel: "voice",
          status: "closed",
          lastMessageAt: new Date(),
        },
      });
    }

    // Guardar transcript como mensaje en la conversación
    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conv.id,
        direction: "out",
        channel: "voice",
        content: JSON.stringify({
          call_id: callId,
          transcript,
          summary: summary ?? null,
        }),
        status: "delivered",
        sentAt: new Date(),
      },
    });

    return debt.debtorId;
  }
}
