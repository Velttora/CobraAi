import { PrismaService } from "@cobrai/db";
import {
  isWithinHours,
  nextValidSendTime,
  resolveCountryRules
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
    } else if (!isWithinHours(at, rules.hours)) {
      result = {
        allowed: false,
        reason: "outside_hours",
        next_allowed_at: nextValidSendTime(at, rules.hours)
      };
    } else {
      const frequencyBlocked = await this.isFrequencyBlocked(
        input.tenantId,
        input.debtorId,
        input.channel,
        at,
        rules.frequency
      );
      if (frequencyBlocked) {
        result = {
          allowed: false,
          reason: rules.frequency.maxPerWeek ? "weekly_limit" : "frequency_limit"
        };
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

  private async isFrequencyBlocked(
    tenantId: string,
    debtorId: string,
    channel: ContactCheckInput["channel"],
    at: Date,
    frequency: {
      maxPerDayPerChannel?: number;
      maxPerWeek?: number;
      maxChannelsPerWeek?: number;
    }
  ): Promise<boolean> {
    const weekStart = new Date(at);
    weekStart.setDate(weekStart.getDate() - 7);

    const weekContacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        debtorId,
        deletedAt: null,
        status: { in: ["scheduled", "in_progress", "completed"] },
        createdAt: { gte: weekStart, lte: at }
      },
      select: { channel: true, createdAt: true }
    });

    if (frequency.maxPerWeek !== undefined) {
      if (weekContacts.length >= frequency.maxPerWeek) return true;
    }

    if (frequency.maxChannelsPerWeek !== undefined) {
      const channels = new Set(weekContacts.map((c) => c.channel));
      if (channels.size >= frequency.maxChannelsPerWeek && !channels.has(channel)) {
        return true;
      }
      if (weekContacts.length >= frequency.maxChannelsPerWeek) return true;
    }

    if (frequency.maxPerDayPerChannel !== undefined) {
      const dayStart = new Date(at);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(at);
      dayEnd.setHours(23, 59, 59, 999);

      const dayCount = weekContacts.filter(
        (c) =>
          c.channel === channel &&
          c.createdAt >= dayStart &&
          c.createdAt <= dayEnd
      ).length;

      if (dayCount >= frequency.maxPerDayPerChannel) return true;
    }

    return false;
  }
}
