import type { PrismaService } from "@cobrai/db";
import { nextValidSendTime } from "./country-rules";
import { addLocalDays, getZonedParts, zonedTimeToUtc } from "./timezone";
import type { CountryHours } from "./types";

/**
 * Returns true when `at` falls on a Colombian national holiday. The lookup key is the
 * America/Bogota civil date at UTC-midnight, matching how the seed stores each holiday.
 */
export async function isHoliday(prisma: PrismaService, at: Date): Promise<boolean> {
  const parts = getZonedParts(at, "America/Bogota");
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const row = await prisma.holiday.findFirst({ where: { date } });
  return Boolean(row);
}

/**
 * Next send instant that is both inside the contact window AND not a holiday. Starts
 * from the next valid window opening and skips forward over consecutive holidays
 * (bounded to avoid an unbounded loop on anomalous data).
 */
export async function nextNonHolidaySendTime(
  prisma: PrismaService,
  at: Date,
  hours: CountryHours,
  timeZone: string
): Promise<Date> {
  let candidate = nextValidSendTime(at, hours, timeZone);
  for (let i = 0; i < 30; i++) {
    if (!(await isHoliday(prisma, candidate))) return candidate;
    let local = getZonedParts(candidate, timeZone);
    do {
      local = addLocalDays(local, 1, timeZone);
    } while (!hours.days.includes(local.dayOfWeek));
    candidate = zonedTimeToUtc(
      local.year,
      local.month,
      local.day,
      hours.startHour,
      timeZone
    );
  }
  return candidate;
}
