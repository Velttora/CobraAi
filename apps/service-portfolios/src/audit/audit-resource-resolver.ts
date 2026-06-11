import { PrismaService } from "@cobrai/db";
import { normalizeAuditResourceType } from "@cobrai/utils";

type AuditRow = {
  resourceType: string;
  resourceId: string;
};

export async function resolveAuditResourceNames(
  prisma: PrismaService,
  tenantId: string,
  rows: AuditRow[]
): Promise<Map<string, string>> {
  const idsByKind = new Map<string, Set<string>>();

  for (const row of rows) {
    const kind = normalizeAuditResourceType(row.resourceType);
    const bucket = idsByKind.get(kind) ?? new Set<string>();
    bucket.add(row.resourceId);
    idsByKind.set(kind, bucket);
  }

  const names = new Map<string, string>();
  const key = (kind: string, id: string) => `${kind}:${id}`;

  const debtorIds = [
    ...new Set([
      ...(idsByKind.get("debtor") ?? []),
      ...(idsByKind.get("debtors") ?? [])
    ])
  ];
  if (debtorIds.length > 0) {
    const debtors = await prisma.debtor.findMany({
      where: { tenantId, id: { in: debtorIds }, deletedAt: null },
      select: { id: true, name: true }
    });
    for (const d of debtors) {
      names.set(key("debtor", d.id), d.name);
    }
  }

  const debtIds = [
    ...new Set([...(idsByKind.get("debt") ?? []), ...(idsByKind.get("debts") ?? [])])
  ];
  if (debtIds.length > 0) {
    const debts = await prisma.debt.findMany({
      where: { tenantId, id: { in: debtIds }, deletedAt: null },
      select: {
        id: true,
        externalRef: true,
        debtor: { select: { name: true } }
      }
    });
    for (const d of debts) {
      const label =
        d.externalRef?.trim() ||
        (d.debtor?.name ? `Deuda de ${d.debtor.name}` : "Deuda");
      names.set(key("debt", d.id), label);
    }
  }

  const portfolioIds = [
    ...new Set([
      ...(idsByKind.get("portfolio") ?? []),
      ...(idsByKind.get("portfolios") ?? [])
    ])
  ];
  if (portfolioIds.length > 0) {
    const portfolios = await prisma.portfolio.findMany({
      where: { tenantId, id: { in: portfolioIds }, deletedAt: null },
      select: { id: true, name: true }
    });
    for (const p of portfolios) {
      names.set(key("portfolio", p.id), p.name);
    }
  }

  const paymentIds = [
    ...new Set([
      ...(idsByKind.get("payment") ?? []),
      ...(idsByKind.get("payments") ?? [])
    ])
  ];
  if (paymentIds.length > 0) {
    const payments = await prisma.payment.findMany({
      where: { tenantId, id: { in: paymentIds }, deletedAt: null },
      select: { id: true, gatewayRef: true, amount: true, currency: true }
    });
    for (const p of payments) {
      const label =
        p.gatewayRef?.trim() ||
        `Pago ${Number(p.amount)} ${p.currency}`;
      names.set(key("payment", p.id), label);
    }
  }

  const contactIds = [
    ...new Set([
      ...(idsByKind.get("contact") ?? []),
      ...(idsByKind.get("contacts") ?? [])
    ])
  ];
  if (contactIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: { tenantId, id: { in: contactIds }, deletedAt: null },
      select: {
        id: true,
        channel: true,
        debtor: { select: { name: true } }
      }
    });
    for (const c of contacts) {
      const label = c.debtor?.name
        ? `Contacto ${c.channel} · ${c.debtor.name}`
        : `Contacto ${c.channel}`;
      names.set(key("contact", c.id), label);
    }
  }

  const tenantIds = [...(idsByKind.get("tenant") ?? [])];
  if (tenantIds.length > 0) {
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds }, deletedAt: null },
      select: { id: true, name: true }
    });
    for (const t of tenants) {
      names.set(key("tenant", t.id), t.name);
    }
  }

  return names;
}

export function lookupResourceName(
  names: Map<string, string>,
  resourceType: string,
  resourceId: string
): string | null {
  const kind = normalizeAuditResourceType(resourceType);
  return names.get(`${kind}:${resourceId}`) ?? null;
}
