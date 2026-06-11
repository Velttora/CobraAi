import type { ContactChannel } from "@cobrai/db";

export type ContactCheckReason =
  | "no_consent"
  | "opt_out_global"
  | "opt_out_channel"
  | "outside_hours"
  | "frequency_limit"
  | "weekly_limit"
  | "whatsapp_not_opted_in"
  | "debtor_not_found";

export interface ContactCheckResult {
  allowed: boolean;
  reason?: ContactCheckReason;
  next_allowed_at?: Date;
}

export interface ContactCheckInput {
  tenantId: string;
  debtorId: string;
  channel: ContactChannel;
  country?: string;
  at?: Date;
  userId?: string;
}

export type CountryHours = {
  startHour: number;
  endHour: number;
  days: number[];
};

export type CountryFrequencyRule = {
  maxPerDayPerChannel?: number;
  maxPerWeek?: number;
  maxChannelsPerWeek?: number;
};

export type CountryRuleSet = {
  code: string;
  /** Zona horaria IANA para evaluar ventanas de contacto en hora local 24h. */
  timezone: string;
  hours: CountryHours;
  frequency: CountryFrequencyRule;
  requireCreditorIdentification: boolean;
  requireExplicitConsent: boolean;
};

export function countryFromAddress(address: unknown): string {
  if (!address || typeof address !== "object") return "CO";
  const country = (address as { country?: string }).country;
  return country?.toUpperCase().slice(0, 2) ?? "CO";
}
