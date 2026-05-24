import type { CountryRuleSet } from "./types";

export const DEFAULT_RULES: CountryRuleSet = {
  code: "DEFAULT",
  hours: { startHour: 8, endHour: 21, days: [0, 1, 2, 3, 4, 5, 6] },
  frequency: { maxPerDayPerChannel: 1 },
  requireCreditorIdentification: true,
  requireExplicitConsent: true
};

export const COUNTRY_RULES: Record<string, CountryRuleSet> = {
  MX: {
    code: "MX",
    hours: { startHour: 7, endHour: 22, days: [1, 2, 3, 4, 5, 6] },
    frequency: { maxPerWeek: 3 },
    requireCreditorIdentification: true,
    requireExplicitConsent: true
  },
  BR: {
    code: "BR",
    hours: { startHour: 7, endHour: 22, days: [0, 1, 2, 3, 4, 5, 6] },
    frequency: { maxPerDayPerChannel: 1 },
    requireCreditorIdentification: true,
    requireExplicitConsent: true
  },
  CO: {
    code: "CO",
    hours: { startHour: 6, endHour: 22, days: [0, 1, 2, 3, 4, 5, 6] },
    frequency: { maxChannelsPerWeek: 1, maxPerWeek: 1 },
    requireCreditorIdentification: true,
    requireExplicitConsent: true
  }
};

export function resolveCountryRules(country: string): CountryRuleSet {
  return COUNTRY_RULES[country] ?? DEFAULT_RULES;
}

export function isWithinHours(at: Date, hours: CountryRuleSet["hours"]): boolean {
  const day = at.getDay();
  if (!hours.days.includes(day)) return false;
  const hour = at.getHours();
  return hour >= hours.startHour && hour < hours.endHour;
}

export function nextValidSendTime(
  from: Date,
  hours: CountryRuleSet["hours"]
): Date {
  const candidate = new Date(from);
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(hours.startHour);

  if (from.getHours() >= hours.endHour || !hours.days.includes(from.getDay())) {
    candidate.setDate(candidate.getDate() + 1);
  } else if (from.getHours() >= hours.startHour && from.getHours() < hours.endHour) {
    candidate.setDate(candidate.getDate() + 1);
  }

  while (!hours.days.includes(candidate.getDay())) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate;
}
