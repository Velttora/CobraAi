import type { EmailSignature } from "./email-layout";
import type { BrandIdentity } from "./brand-identity";

/**
 * Merges the tenant's brand identity over a stored `EmailSignature`, field by
 * field — the brand value wins when set, the stored signature value survives
 * otherwise. `socials` is never touched: it stays owned by the email builder
 * (UI-SPEC A-05). Brand identity is the single source of truth for company
 * identity; `EmailSignature`'s overlapping fields are now a read-through
 * mirror rather than an independent copy, so email and WhatsApp can never
 * show a different company name.
 */
export function mergeBrandIntoSignature(
  signature: EmailSignature,
  brand: BrandIdentity | undefined
): EmailSignature {
  if (!brand) return signature;
  return {
    ...signature,
    companyName: brand.commercialName ?? signature.companyName,
    logoUrl: brand.logoUrl ?? signature.logoUrl,
    address: brand.address ?? signature.address,
    phone: brand.supportPhone ?? signature.phone,
    website: brand.website ?? signature.website,
    legalDisclaimer: brand.legalNotice ?? signature.legalDisclaimer
  };
}
