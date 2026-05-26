import { TenantPlan, type PrismaClient } from "@prisma/client";

type TenantClient = Pick<PrismaClient, "tenant">;

export function tenantSlugFromId(tenantId: string): string {
  const base = tenantId
    .replace(/^org_/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (base || "tenant").slice(0, 48);
}

/** Crea el tenant si Clerk ya tiene org pero el webhook aún no sincronizó. */
export async function ensureTenantRecord(
  prisma: TenantClient,
  tenantId: string,
  name?: string
): Promise<void> {
  const displayName = name?.trim() || "Mi organización";

  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name: displayName,
      slug: tenantSlugFromId(tenantId),
      plan: TenantPlan.trial,
      isActive: true
    },
    update: {
      isActive: true,
      deletedAt: null,
      ...(name?.trim() ? { name: displayName } : {})
    }
  });
}
