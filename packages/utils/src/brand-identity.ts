/**
 * Tenant brand identity — the commercial name, logo, contact details and legal
 * signature the tenant shows to a debtor across every channel.
 *
 * FUENTE ÚNICA DE VERDAD: `variables.empresa` in the WhatsApp/voice/email
 * templates, the LLM system prompt and Vapi's `strategy_context.variables` all
 * derive from this shape (see `resolveBrandVariables`). The email builder's
 * `SignatureEditor` used to hold its own copy of company data — it now reads
 * through to this instead (UI-SPEC A-05); see `packages/utils/src/email-layout-brand.ts`.
 */

/** Fallback shown to a debtor when the tenant has not set a commercial name. */
export const EMPRESA_FALLBACK = "su gestor de cobranza";

export interface BrandIdentity {
  commercialName: string | null; // fills variables.empresa
  logoUrl: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  website: string | null;
  address: string | null;
  legalName: string | null; // razón social
  taxId: string | null; // NIT
  legalNotice: string | null; // aviso legal
}

export const EMPTY_BRAND_IDENTITY: BrandIdentity = {
  commercialName: null,
  logoUrl: null,
  supportPhone: null,
  supportEmail: null,
  website: null,
  address: null,
  legalName: null,
  taxId: null,
  legalNotice: null
};

/** Trims a value; returns `null` for anything that isn't a non-empty string. */
function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Trims a URL field and requires an `http(s)://` scheme. Anything else — a
 * `javascript:`/`data:` URL, a bare string, a non-string — becomes `null`, so
 * a stored value can never survive into the `href`/`src` of the HTML email
 * `renderEmailLayout` produces (T-08-15a).
 */
function trimmedHttpUrlOrNull(value: unknown): string | null {
  const trimmed = trimmedOrNull(value);
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/**
 * Sanitizes an arbitrary input into a well-formed `BrandIdentity`. Never
 * throws — an invalid or missing field simply falls back to `null` — so a
 * partial or malformed `Tenant.settings.brandIdentity` can never break the
 * tenant profile response or a send. Unknown keys are dropped, which also
 * keeps this endpoint from being used to smuggle arbitrary data into
 * `settings` (T-08-15c).
 */
export function sanitizeBrandIdentity(input: unknown): BrandIdentity {
  const rec = (input ?? {}) as Record<string, unknown>;
  return {
    commercialName: trimmedOrNull(rec.commercialName),
    logoUrl: trimmedHttpUrlOrNull(rec.logoUrl),
    supportPhone: trimmedOrNull(rec.supportPhone),
    supportEmail: trimmedOrNull(rec.supportEmail),
    website: trimmedHttpUrlOrNull(rec.website),
    address: trimmedOrNull(rec.address),
    legalName: trimmedOrNull(rec.legalName),
    taxId: trimmedOrNull(rec.taxId),
    legalNotice: trimmedOrNull(rec.legalNotice)
  };
}

export interface BrandVariables {
  empresa: string;
  empresa_telefono: string;
  empresa_correo: string;
  empresa_sitio_web: string;
  empresa_razon_social: string;
  empresa_nit: string;
  empresa_aviso_legal: string;
}

/**
 * Template/prompt variables derived from a brand identity. `empresa` falls
 * back to `EMPRESA_FALLBACK` when there is no commercial name; every other
 * unset field resolves to `""`, never the literal `null`/`undefined`, so it
 * can be interpolated safely into a message, a prompt or a spoken sentence.
 */
export function resolveBrandVariables(identity: BrandIdentity): BrandVariables {
  return {
    empresa: identity.commercialName ?? EMPRESA_FALLBACK,
    empresa_telefono: identity.supportPhone ?? "",
    empresa_correo: identity.supportEmail ?? "",
    empresa_sitio_web: identity.website ?? "",
    empresa_razon_social: identity.legalName ?? "",
    empresa_nit: identity.taxId ?? "",
    empresa_aviso_legal: identity.legalNotice ?? ""
  };
}
