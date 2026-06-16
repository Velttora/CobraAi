import {
  normalizeLayoutConfig,
  type EmailBlock,
  type EmailBlockType,
  type EmailLayoutConfig,
  type EmailSignature,
  type EmailSocialLink
} from "@cobrai/utils";
import { randomUUID } from "node:crypto";

/** Body de PUT /api/v1/email-layout — la config del borrador (shell + firma). */
export type UpdateEmailLayoutDto = Partial<EmailLayoutConfig>;

export type EmailLayoutResponse = {
  draft: EmailLayoutConfig;
  published: EmailLayoutConfig | null;
  published_at: string | null;
  has_published: boolean;
};

const BLOCK_TYPES: ReadonlySet<EmailBlockType> = new Set<EmailBlockType>([
  "logo",
  "heading",
  "text",
  "body",
  "button",
  "divider",
  "spacer",
  "image",
  "social",
  "signature"
]);

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sanitizeSocials(value: unknown): EmailSocialLink[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const links = value
    .map((s) => {
      const rec = (s ?? {}) as Record<string, unknown>;
      const type = asString(rec.type);
      const url = asString(rec.url);
      return type !== undefined && url !== undefined ? { type, url } : null;
    })
    .filter((s): s is EmailSocialLink => s !== null);
  return links;
}

function sanitizeSignature(value: unknown): EmailSignature {
  const rec = (value ?? {}) as Record<string, unknown>;
  const sig: EmailSignature = {};
  const companyName = asString(rec.companyName);
  const logoUrl = asString(rec.logoUrl);
  const address = asString(rec.address);
  const phone = asString(rec.phone);
  const website = asString(rec.website);
  const legalDisclaimer = asString(rec.legalDisclaimer);
  const socials = sanitizeSocials(rec.socials);
  if (companyName !== undefined) sig.companyName = companyName;
  if (logoUrl !== undefined) sig.logoUrl = logoUrl;
  if (address !== undefined) sig.address = address;
  if (phone !== undefined) sig.phone = phone;
  if (website !== undefined) sig.website = website;
  if (legalDisclaimer !== undefined) sig.legalDisclaimer = legalDisclaimer;
  if (socials !== undefined) sig.socials = socials;
  return sig;
}

function sanitizeBlocks(value: unknown): EmailBlock[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((b) => {
      const rec = (b ?? {}) as Record<string, unknown>;
      const type = rec.type;
      if (typeof type !== "string" || !BLOCK_TYPES.has(type as EmailBlockType)) {
        return null;
      }
      const props =
        rec.props && typeof rec.props === "object" && !Array.isArray(rec.props)
          ? (rec.props as Record<string, unknown>)
          : {};
      const id = asString(rec.id) ?? randomUUID();
      return { id, type: type as EmailBlockType, props } satisfies EmailBlock;
    })
    .filter((b): b is EmailBlock => b !== null);
}

/**
 * Coacciona JSON arbitrario del cliente a una `EmailLayoutConfig` válida:
 * descarta bloques desconocidos, asegura ids, y completa settings con defaults.
 * El gateway no confía en la forma del body (validación defensiva).
 */
export function sanitizeLayoutConfig(input: unknown): EmailLayoutConfig {
  const rec = (input ?? {}) as Record<string, unknown>;
  const normalized = normalizeLayoutConfig({
    blocks: sanitizeBlocks(rec.blocks),
    settings: (rec.settings ?? {}) as never,
    signature: sanitizeSignature(rec.signature)
  });
  return normalized;
}
