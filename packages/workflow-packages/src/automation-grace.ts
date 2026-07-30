/** Default hours to wait after enabling automation before contacts fire. */
export const DEFAULT_AUTOMATION_GRACE_HOURS = 2;

/**
 * Statuses eligible for a first-touch / welcome (`debt_created`) contact.
 * Includes `upcoming` so pipeline imports get welcome before pre-due reminders.
 */
export const WELCOME_ELIGIBLE_STATUSES = [
  "new",
  "upcoming",
  "analyzing",
  "active"
] as const;

export function resolveAutomationGraceHours(
  envValue?: string | number | null
): number {
  if (envValue === undefined || envValue === null || envValue === "") {
    return DEFAULT_AUTOMATION_GRACE_HOURS;
  }
  const n = typeof envValue === "number" ? envValue : Number(envValue);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_AUTOMATION_GRACE_HOURS;
  return n;
}

/** Instant when automation may start sending, given "now" and grace hours. */
export function computeAutomationStartsAt(
  now: Date = new Date(),
  graceHours: number = DEFAULT_AUTOMATION_GRACE_HOURS
): Date {
  return new Date(now.getTime() + Math.max(0, graceHours) * 3_600_000);
}

export function isAutomationGraceActive(
  automationStartsAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!automationStartsAt) return false;
  const starts =
    automationStartsAt instanceof Date
      ? automationStartsAt
      : new Date(automationStartsAt);
  if (Number.isNaN(starts.getTime())) return false;
  return starts.getTime() > now.getTime();
}
