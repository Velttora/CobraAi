import { BadRequestException } from "@nestjs/common";
import { DEFAULT_RETRY_POLICY, type ContactRetryPolicy } from "@cobrai/compliance";
import { sanitizeBrandIdentity, type BrandIdentity } from "@cobrai/utils";

export type TenantProfile = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  contactRetryPolicy: ContactRetryPolicy;
  whatsappFromNumber: string | null;
  brandIdentity: BrandIdentity;
};

export type UpdateTenantDto = {
  name: string;
};

export type UpdateContactRetryPolicyDto = Partial<ContactRetryPolicy>;

export type UpdateWhatsappSenderDto = {
  whatsappFromNumber: string | null;
};

export type UpdateBrandIdentityDto = Partial<BrandIdentity>;

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
  const settings = (tenant.settings ?? {}) as {
    contactRetryPolicy?: unknown;
    whatsappFromNumber?: unknown;
    brandIdentity?: unknown;
  };
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    contactRetryPolicy: sanitizeContactRetryPolicy(settings.contactRetryPolicy),
    whatsappFromNumber:
      typeof settings.whatsappFromNumber === "string"
        ? settings.whatsappFromNumber
        : null,
    brandIdentity: sanitizeBrandIdentity(settings.brandIdentity)
  };
}

const WHATSAPP_E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Normaliza y valida el número propio de WhatsApp Business del tenant (E.164).
 * `null` o vacío limpia el número (el tenant vuelve a usar el compartido/global).
 */
export function normalizeWhatsappFromNumber(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  const digits = raw.trim().replace(/^whatsapp:/, "");
  if (!WHATSAPP_E164_RE.test(digits)) {
    throw new BadRequestException(
      "Número de WhatsApp inválido: usa formato E.164, ej. +14155551234"
    );
  }
  return `whatsapp:${digits}`;
}
