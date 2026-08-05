import { resolveBrandVariables, sanitizeBrandIdentity, type BrandIdentity } from "@cobrai/utils";

export interface ResolvedTenantBrand {
  identity: BrandIdentity;
  variables: Record<string, string>;
}

/**
 * Resolves the tenant's brand identity and the `empresa*` variables derived
 * from it. `empresa` follows an explicit fallback chain: commercial name →
 * organization name (a better fallback than a generic phrase) → EMPRESA_FALLBACK.
 */
export function resolveTenantBrand(
  tenant: { name?: string | null; settings?: unknown } | null | undefined
): ResolvedTenantBrand {
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const identity = sanitizeBrandIdentity(settings.brandIdentity);
  const resolved = resolveBrandVariables(identity);
  const empresa = identity.commercialName || tenant?.name?.trim() || resolved.empresa;
  return { identity, variables: { ...resolved, empresa } };
}
