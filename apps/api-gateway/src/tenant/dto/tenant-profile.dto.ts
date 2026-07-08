import { DEFAULT_RETRY_POLICY, type ContactRetryPolicy } from "@cobrai/compliance";

export type TenantProfile = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  contactRetryPolicy: ContactRetryPolicy;
};

export type UpdateTenantDto = {
  name: string;
};

export type UpdateContactRetryPolicyDto = Partial<ContactRetryPolicy>;

const MIN_WINDOW_HOURS = 1;
const MAX_WINDOW_HOURS = 24 * 14; // 2 semanas
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 10;

/** Valida y acota los valores editables por el tenant; nunca deja la política en un estado absurdo. */
export function sanitizeContactRetryPolicy(
  input: unknown,
  fallback: ContactRetryPolicy = DEFAULT_RETRY_POLICY
): ContactRetryPolicy {
  const rec = (input ?? {}) as Record<string, unknown>;

  const windowHours =
    typeof rec.windowHours === "number" && Number.isFinite(rec.windowHours)
      ? Math.min(MAX_WINDOW_HOURS, Math.max(MIN_WINDOW_HOURS, Math.round(rec.windowHours)))
      : fallback.windowHours;

  const maxAttempts =
    typeof rec.maxAttempts === "number" && Number.isFinite(rec.maxAttempts)
      ? Math.min(MAX_ATTEMPTS, Math.max(MIN_ATTEMPTS, Math.round(rec.maxAttempts)))
      : fallback.maxAttempts;

  const escalation =
    rec.escalation === "switch_channel" || rec.escalation === "same_channel"
      ? rec.escalation
      : fallback.escalation;

  const escalateTo =
    rec.escalateTo === "legal_risk" || rec.escalateTo === "human"
      ? rec.escalateTo
      : fallback.escalateTo;

  return { windowHours, maxAttempts, escalation, escalateTo };
}

export function toTenantProfile(tenant: {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings?: unknown;
}): TenantProfile {
  const settings = (tenant.settings ?? {}) as { contactRetryPolicy?: unknown };
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    contactRetryPolicy: sanitizeContactRetryPolicy(settings.contactRetryPolicy)
  };
}
