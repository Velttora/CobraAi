export type TenantProfile = {
  id: string;
  name: string;
  slug: string;
  plan: string;
};

export type UpdateTenantDto = {
  name: string;
};

export function toTenantProfile(tenant: {
  id: string;
  name: string;
  slug: string;
  plan: string;
}): TenantProfile {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan
  };
}
