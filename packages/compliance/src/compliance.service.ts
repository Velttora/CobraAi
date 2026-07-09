import { PrismaService } from "@cobrai/db";
import {
  isWithinHours,
  nextValidSendTime,
  resolveCountryRules,
  resolveRetryPolicy
} from "./country-rules";
import { ConsentService } from "./consent.service";
import { OptOutService } from "./opt-out.service";
import { AuditService } from "./audit.service";
import {
  countryFromAddress,
  type ContactCheckInput,
  type ContactCheckResult
} from "./types";

export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly optOut: OptOutService,
    private readonly audit: AuditService
  ) {}

  async checkContact(input: ContactCheckInput): Promise<ContactCheckResult> {
    const at = input.at ?? new Date();
    const debtor = await this.prisma.debtor.findFirst({
      where: {
        id: input.debtorId,
        tenantId: input.tenantId,
        deletedAt: null
      }
    });

    if (!debtor) {
      return { allowed: false, reason: "debtor_not_found" };
    }

    const country = input.country ?? countryFromAddress(debtor.address);
    const rules = resolveCountryRules(country);
    let result: ContactCheckResult = { allowed: true };

    if (this.optOut.isGlobalOptOut(debtor)) {
      result = { allowed: false, reason: "opt_out_global" };
    } else if (this.optOut.isChannelOptOut(debtor, input.channel)) {
      result = { allowed: false, reason: "opt_out_channel" };
    } else if (input.channel === "whatsapp" && !debtor.whatsappOptIn) {
      result = { allowed: false, reason: "whatsapp_not_opted_in" };
    } else if (
      rules.requireExplicitConsent &&
      !(await this.consent.hasActiveConsent(
        input.tenantId,
        input.debtorId,
        input.channel
      ))
    ) {
      result = { allowed: false, reason: "no_consent" };
    } else if (!isWithinHours(at, rules.hours, rules.timezone)) {
      result = {
        allowed: false,
        reason: "outside_hours",
        next_allowed_at: nextValidSendTime(at, rules.hours, rules.timezone)
      };
    } else {
      const dayBlocked = await this.isDayFrequencyBlocked(
        input.tenantId,
        input.debtorId,
        input.channel,
        at,
        rules.frequency
      );
      if (dayBlocked) {
        result = { allowed: false, reason: "frequency_limit" };
      } else {
        const retryState = await this.getRetryState(
          input.tenantId,
          input.debtorId,
          at
        );
        if (!retryState.allowed) {
          result = {
            allowed: false,
            reason: retryState.reason,
            next_allowed_at: retryState.next_allowed_at
          };
        }
      }
    }

    await this.audit.logComplianceDecision({
      tenantId: input.tenantId,
      debtorId: input.debtorId,
      channel: input.channel,
      allowed: result.allowed,
      reason: result.reason,
      userId: input.userId
    });

    return result;
  }

  /** Compatibilidad con service-notifications. */
  async checkBeforeSend(input: {
    tenantId: string;
    debtor: { id: string; address: unknown; whatsappOptIn: boolean };
    channel: ContactCheckInput["channel"];
    at?: Date;
    userId?: string;
  }): Promise<ContactCheckResult> {
    return this.checkContact({
      tenantId: input.tenantId,
      debtorId: input.debtor.id,
      channel: input.channel,
      country: countryFromAddress(input.debtor.address),
      at: input.at,
      userId: input.userId
    });
  }

  /**
   * Verifica si un canal está habilitado para el deudor según su CONFIGURACIÓN:
   * opt-out global/canal, opt-in de WhatsApp y consentimiento requerido por país.
   *
   * A diferencia de checkContact, NO evalúa horario ni frecuencia. Está pensado
   * para mensajes transaccionales que el propio deudor solicitó —por ejemplo el
   * enlace de pago tras acordar en una llamada—, donde sí debemos respetar el
   * consentimiento y el opt-out, pero no las ventanas de contacto proactivo.
   */
  async isChannelEligible(input: {
    tenantId: string;
    debtorId: string;
    channel: ContactCheckInput["channel"];
    country?: string;
  }): Promise<ContactCheckResult> {
    const debtor = await this.prisma.debtor.findFirst({
      where: {
        id: input.debtorId,
        tenantId: input.tenantId,
        deletedAt: null
      }
    });

    if (!debtor) {
      return { allowed: false, reason: "debtor_not_found" };
    }

    if (this.optOut.isGlobalOptOut(debtor)) {
      return { allowed: false, reason: "opt_out_global" };
    }
    if (this.optOut.isChannelOptOut(debtor, input.channel)) {
      return { allowed: false, reason: "opt_out_channel" };
    }
    if (input.channel === "whatsapp" && !debtor.whatsappOptIn) {
      return { allowed: false, reason: "whatsapp_not_opted_in" };
    }

    const country = input.country ?? countryFromAddress(debtor.address);
    const rules = resolveCountryRules(country);
    if (
      rules.requireExplicitConsent &&
      !(await this.consent.hasActiveConsent(
        input.tenantId,
        input.debtorId,
        input.channel
      ))
    ) {
      return { allowed: false, reason: "no_consent" };
    }

    return { allowed: true };
  }

  /** Tope anti-spam del mismo día (ortogonal al ciclo de reintentos, ver getRetryState). */
  private async isDayFrequencyBlocked(
    tenantId: string,
    debtorId: string,
    channel: ContactCheckInput["channel"],
    at: Date,
    frequency: { maxPerDayPerChannel?: number }
  ): Promise<boolean> {
    if (frequency.maxPerDayPerChannel === undefined) return false;

    const dayStart = new Date(at);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(at);
    dayEnd.setHours(23, 59, 59, 999);

    const dayCount = await this.prisma.contact.count({
      where: {
        tenantId,
        debtorId,
        channel,
        deletedAt: null,
        status: { in: ["scheduled", "in_progress", "completed"] },
        createdAt: { gte: dayStart, lte: dayEnd }
      }
    });

    return dayCount >= frequency.maxPerDayPerChannel;
  }

  /**
   * Estado del ciclo de reintento del deudor: en vez de contar envíos en una ventana
   * rodante, mira el intento de contacto más reciente y decide si toca esperar respuesta,
   * esperar el cooldown de reintento, o si el ciclo ya agotó sus intentos (estado terminal,
   * a resolver por el sweep de reintentos/escalamiento — ver ContactRetrySweepService).
   */
  async getRetryState(
    tenantId: string,
    debtorId: string,
    at: Date
  ): Promise<ContactCheckResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    const policy = resolveRetryPolicy(tenant?.settings);

    const latest = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        debtorId,
        deletedAt: null,
        // "failed" incluido: un envío fallido igual cuenta como intento en curso.
        // Si se omite, N deudas del mismo deudor cuyo 1er envío falla disparan N
        // contactos (la dedup del coordinator no lo ve) → sobre-contacto.
        status: { in: ["scheduled", "in_progress", "completed", "failed"] }
      },
      orderBy: { createdAt: "desc" },
      select: {
        responseStatus: true,
        startedAt: true,
        createdAt: true,
        nextRetryAt: true,
        attemptNumber: true
      }
    });

    if (!latest) return { allowed: true };

    if (latest.responseStatus === "pending") {
      const sentAt = latest.startedAt ?? latest.createdAt;
      const windowEnd = new Date(
        sentAt.getTime() + policy.windowHours * 60 * 60 * 1000
      );
      if (at < windowEnd) {
        return {
          allowed: false,
          reason: "awaiting_response",
          next_allowed_at: windowEnd
        };
      }
      // La ventana venció pero el sweep aún no lo marcó no_response — no bloquear
      // indefinidamente por un detalle de temporización del cron.
      return { allowed: true };
    }

    if (latest.responseStatus === "no_response") {
      if (latest.attemptNumber >= policy.maxAttempts) {
        return { allowed: false, reason: "max_attempts_reached" };
      }
      if (latest.nextRetryAt && at < latest.nextRetryAt) {
        return {
          allowed: false,
          reason: "retry_cooldown",
          next_allowed_at: latest.nextRetryAt
        };
      }
    }

    // responseStatus === "effective" → el ciclo se cerró con una conversación real;
    // un nuevo contacto empieza un ciclo fresco sin restricción.
    return { allowed: true };
  }
}
