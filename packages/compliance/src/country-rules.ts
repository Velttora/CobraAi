import type { CountryRuleSet } from "./types";
import {
  addLocalDays,
  getZonedParts,
  timezoneForCountry,
  zonedTimeToUtc
} from "./timezone";

export const DEFAULT_RULES: CountryRuleSet = {
  code: "DEFAULT",
  timezone: "America/Bogota",
  hours: { startHour: 8, endHour: 21, days: [0, 1, 2, 3, 4, 5, 6] },
  frequency: { maxPerDayPerChannel: 1 },
  requireCreditorIdentification: true,
  requireExplicitConsent: true
};

export const COUNTRY_RULES: Record<string, CountryRuleSet> = {
  MX: {
    code: "MX",
    timezone: "America/Mexico_City",
    hours: { startHour: 7, endHour: 22, days: [1, 2, 3, 4, 5, 6] },
    frequency: { maxPerWeek: 3 },
    requireCreditorIdentification: true,
    requireExplicitConsent: true
  },
  BR: {
    code: "BR",
    timezone: "America/Sao_Paulo",
    hours: { startHour: 7, endHour: 22, days: [0, 1, 2, 3, 4, 5, 6] },
    frequency: { maxPerDayPerChannel: 1 },
    requireCreditorIdentification: true,
    requireExplicitConsent: true
  },
  CO: {
    code: "CO",
    timezone: "America/Bogota",
    hours: { startHour: 6, endHour: 22, days: [0, 1, 2, 3, 4, 5, 6] },
    frequency: { maxChannelsPerWeek: 1, maxPerWeek: 1 },
    requireCreditorIdentification: true,
    requireExplicitConsent: true
  }
};

export function resolveCountryRules(country: string): CountryRuleSet {
  const rules = COUNTRY_RULES[country] ?? DEFAULT_RULES;
  return {
    ...rules,
    timezone: rules.timezone ?? timezoneForCountry(country)
  };
}

/** Evalúa horario de contacto con reloj local 24h del país (no UTC del servidor). */
export function isWithinHours(
  at: Date,
  hours: CountryRuleSet["hours"],
  timeZone: string
): boolean {
  const local = getZonedParts(at, timeZone);
  if (!hours.days.includes(local.dayOfWeek)) return false;
  return local.hour >= hours.startHour && local.hour < hours.endHour;
}

/** Próximo instante UTC en que se abre la ventana de contacto (hora local). */
export function nextValidSendTime(
  from: Date,
  hours: CountryRuleSet["hours"],
  timeZone: string
): Date {
  let local = getZonedParts(from, timeZone);

  const todayAllowed = hours.days.includes(local.dayOfWeek);
  const beforeWindow = todayAllowed && local.hour < hours.startHour;
  const afterWindow =
    !todayAllowed ||
    local.hour >= hours.endHour ||
    (todayAllowed &&
      local.hour >= hours.startHour &&
      local.hour < hours.endHour);

  if (beforeWindow) {
    return zonedTimeToUtc(
      local.year,
      local.month,
      local.day,
      hours.startHour,
      timeZone
    );
  }

  if (afterWindow) {
    local = addLocalDays(local, 1, timeZone);
    while (!hours.days.includes(local.dayOfWeek)) {
      local = addLocalDays(local, 1, timeZone);
    }
    return zonedTimeToUtc(
      local.year,
      local.month,
      local.day,
      hours.startHour,
      timeZone
    );
  }

  return zonedTimeToUtc(
    local.year,
    local.month,
    local.day,
    hours.startHour,
    timeZone
  );
}
