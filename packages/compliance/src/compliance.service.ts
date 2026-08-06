import { PrismaService, type ContactChannel } from "@cobrai/db";
import type { IntegrationChannel } from "@cobrai/integrations";
import { TenantIntegrationService } from "@cobrai/integrations";
import { isWithinHours, nextValidSendTime, resolveCountryRules } from "./country-rules";
import { isHoliday, nextNonHolidaySendTime } from "./holiday-rules";
import { computeRetryState } from "./retry-state";
import { ConsentService } from "./consent.service";
import { OptOutService } from "./opt-out.service";
import { AuditService } from "./audit.service";
import {
  countryFromAddress,
  type ContactCheckInput,
  type ContactCheckResult
} from "./types";

/** ContactChannel members with no matching TenantIntegration to gate on (D-16). */
const UNGATED_CHANNELS: ReadonlySet<ContactChannel> = new Set(["internal", "portal"]);

export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly optOut: OptOutService,
    private readonly audit: AuditService,
    private readonly integrations: TenantIntegrationService
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
    } else if (!(await this.isChannelConfigured(input.tenantId, input.channel))) {
      // Deliberate placement: opt-out and consent are more specific reasons and must
      // win over this one, but an unconfigured channel is a hard block that no amount
      // of waiting resolves, so no next_allowed_at is set (D-16).
      result = { allowed: false, reason: "channel_not_configured" };
    } else if (!isWithinHours(at, rules.hours, rules.timezone)) {
      result = {
        allowed: false,
        reason: "outside_hours",
        next_allowed_at: nextValidSendTime(at, rules.hours, rules.timezone)
      };
    } else if (country === "CO" && (await isHoliday(this.prisma, at))) {
      // Colombian national holiday: no proactive contact today, regardless of hours.
      result = {
        allowed: false,
        reason: "holiday",
        next_allowed_at: await nextNonHolidaySendTime(
          this.prisma,
          at,
          rules.hours,
          rules.timezone
        )
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
        const retryState = await computeRetryState(
          this.prisma,
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
    at?: Date;
  }): Promise<ContactCheckResult> {
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
    if (!(await this.isChannelConfigured(input.tenantId, input.channel))) {
      // Same ordering rule as checkContact: opt-out/consent win, an unconfigured
      // channel is a hard block, and (deliberately, unlike checkContact) this lane
      // still does not evaluate hours or frequency at all (D-16).
      return { allowed: false, reason: "channel_not_configured" };
    }

    // A Colombian holiday blocks every send, including debtor-requested transactional
    // messages — not just proactive outreach.
    if (country === "CO" && (await isHoliday(this.prisma, at))) {
      return {
        allowed: false,
        reason: "holiday",
        next_allowed_at: await nextNonHolidaySendTime(
          this.prisma,
          at,
          rules.hours,
          rules.timezone
        )
      };
    }

    return { allowed: true };
  }

  /**
   * Returns true when the tenant has a verified TenantIntegration for `channel` (D-16).
   * `internal`/`portal` have no matching integration and are never gated. `sms` is routed
   * over WhatsApp today (see `resolveMessageChannel`), so it is gated on the whatsapp
   * integration, not a dedicated sms provider.
   */
  private async isChannelConfigured(
    tenantId: string,
    channel: ContactChannel
  ): Promise<boolean> {
    if (UNGATED_CHANNELS.has(channel)) return true;
    const mapped: IntegrationChannel = channel === "sms" ? "whatsapp" : (channel as IntegrationChannel);
    return this.integrations.hasVerifiedChannel(tenantId, mapped);
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
        createdAt: { gte: dayStart, lte: dayEnd },
        // D-17: a simulated send never reached the debtor, so it cannot consume
        // their Ley 1266 allowance. Without this the flag is written and never
        // read, and a run with simulation enabled silently locks a debtor out
        // of a real contact because a fake one "already happened".
        simulated: false
      }
    });

    return dayCount >= frequency.maxPerDayPerChannel;
  }

  /**
   * Estado del ciclo de reintento del deudor. Implementación en `./retry-state.ts`
   * (extraída para respetar el límite de 300 líneas por archivo); este método
   * público se conserva porque otros servicios lo invocan directamente
   * (`compliance.getRetryState(...)`).
   */
  async getRetryState(
    tenantId: string,
    debtorId: string,
    at: Date
  ): Promise<ContactCheckResult> {
    return computeRetryState(this.prisma, tenantId, debtorId, at);
  }
}
