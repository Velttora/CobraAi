import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "@cobrai/db";
import { queryUncontactedDebts } from "./integrations.uncontacted-debts.query";

function makePrismaMock() {
  return {
    auditLog: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    debt: { findMany: vi.fn() }
  };
}

function blockLog(overrides: Partial<{ resourceId: string; channel: string; createdAt: Date }> = {}) {
  return {
    resourceId: overrides.resourceId ?? "debtor-1",
    changes: { reason: "channel_not_configured", channel: overrides.channel ?? "whatsapp", allowed: false },
    createdAt: overrides.createdAt ?? new Date("2026-08-01T00:00:00.000Z")
  };
}

function debtRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "debt-1",
    debtorId: "debtor-1",
    externalRef: "FAC-001",
    amountOutstanding: { toString: () => "450000" },
    currency: "COP",
    debtor: { id: "debtor-1", name: "María Rodríguez" },
    ...overrides
  };
}

describe("queryUncontactedDebts", () => {
  it("returns debts whose most recent compliance decision was a channel_not_configured block, newest first", async () => {
    const prisma = makePrismaMock();
    prisma.auditLog.findMany.mockResolvedValueOnce([
      blockLog({ resourceId: "debtor-1", createdAt: new Date("2026-08-02T00:00:00.000Z") }),
      blockLog({ resourceId: "debtor-2", createdAt: new Date("2026-08-01T00:00:00.000Z") })
    ]);
    prisma.contact.findMany.mockResolvedValueOnce([]);
    prisma.debt.findMany.mockResolvedValueOnce([
      debtRow({ id: "debt-1", debtorId: "debtor-1" }),
      debtRow({ id: "debt-2", debtorId: "debtor-2", debtor: { id: "debtor-2", name: "Carlos Ruiz" } })
    ]);

    const result = await queryUncontactedDebts(prisma as unknown as PrismaService, "tenant-1", 1, 25);

    expect(result.items.map((i) => i.debtId)).toEqual(["debt-1", "debt-2"]);
    expect(result.total).toBe(2);
  });

  it("each row carries debtor name, external ref, outstanding amount, currency, blocked channel and the block timestamp", async () => {
    const prisma = makePrismaMock();
    prisma.auditLog.findMany.mockResolvedValueOnce([blockLog({ channel: "email" })]);
    prisma.contact.findMany.mockResolvedValueOnce([]);
    prisma.debt.findMany.mockResolvedValueOnce([debtRow()]);

    const result = await queryUncontactedDebts(prisma as unknown as PrismaService, "tenant-1", 1, 25);

    expect(result.items[0]).toEqual({
      debtId: "debt-1",
      debtorId: "debtor-1",
      debtorName: "María Rodríguez",
      externalRef: "FAC-001",
      amountOutstanding: 450000,
      currency: "COP",
      blockedChannel: "email",
      blockedSince: "2026-08-01T00:00:00.000Z"
    });
  });

  it("excludes a debtor who has since been contacted successfully on the blocked channel", async () => {
    const prisma = makePrismaMock();
    prisma.auditLog.findMany.mockResolvedValueOnce([
      blockLog({ resourceId: "debtor-1", createdAt: new Date("2026-08-01T00:00:00.000Z") })
    ]);
    prisma.contact.findMany.mockResolvedValueOnce([
      { debtorId: "debtor-1", channel: "whatsapp", createdAt: new Date("2026-08-02T00:00:00.000Z") }
    ]);
    prisma.debt.findMany.mockResolvedValueOnce([]);

    const result = await queryUncontactedDebts(prisma as unknown as PrismaService, "tenant-1", 1, 25);

    expect(result).toEqual({ items: [], total: 0, page: 1 });
    expect(prisma.debt.findMany).not.toHaveBeenCalled();
  });

  it("does not exclude a debtor whose successful contact predates the block (still blocked now)", async () => {
    const prisma = makePrismaMock();
    prisma.auditLog.findMany.mockResolvedValueOnce([
      blockLog({ resourceId: "debtor-1", createdAt: new Date("2026-08-02T00:00:00.000Z") })
    ]);
    prisma.contact.findMany.mockResolvedValueOnce([
      { debtorId: "debtor-1", channel: "whatsapp", createdAt: new Date("2026-08-01T00:00:00.000Z") }
    ]);
    prisma.debt.findMany.mockResolvedValueOnce([debtRow()]);

    const result = await queryUncontactedDebts(prisma as unknown as PrismaService, "tenant-1", 1, 25);

    expect(result.items).toHaveLength(1);
  });

  it("scopes every query to the tenant — the tenant id is forwarded to audit log, contact and debt lookups", async () => {
    const prisma = makePrismaMock();
    prisma.auditLog.findMany.mockResolvedValueOnce([blockLog()]);
    prisma.contact.findMany.mockResolvedValueOnce([]);
    prisma.debt.findMany.mockResolvedValueOnce([debtRow()]);

    await queryUncontactedDebts(prisma as unknown as PrismaService, "tenant-a", 1, 25);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a" }) })
    );
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a" }) })
    );
    expect(prisma.debt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a" }) })
    );
  });

  it("another tenant's blocked debts never appear — the audit log query is scoped, so a tenant with no matching rows gets an empty page", async () => {
    const prisma = makePrismaMock();
    prisma.auditLog.findMany.mockResolvedValueOnce([]); // tenant-b has no blocks in this simulated DB

    const result = await queryUncontactedDebts(prisma as unknown as PrismaService, "tenant-b", 1, 25);

    expect(result).toEqual({ items: [], total: 0, page: 1 });
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
    expect(prisma.debt.findMany).not.toHaveBeenCalled();
  });

  it("an empty result returns an empty array with total: 0 rather than throwing", async () => {
    const prisma = makePrismaMock();
    prisma.auditLog.findMany.mockResolvedValueOnce([]);

    await expect(queryUncontactedDebts(prisma as unknown as PrismaService, "tenant-1", 1, 25)).resolves.toEqual({
      items: [],
      total: 0,
      page: 1
    });
  });

  it("paginates at the requested page size and reports the true total", async () => {
    const prisma = makePrismaMock();
    prisma.auditLog.findMany.mockResolvedValueOnce([
      blockLog({ resourceId: "debtor-1", createdAt: new Date("2026-08-03T00:00:00.000Z") }),
      blockLog({ resourceId: "debtor-2", createdAt: new Date("2026-08-02T00:00:00.000Z") }),
      blockLog({ resourceId: "debtor-3", createdAt: new Date("2026-08-01T00:00:00.000Z") })
    ]);
    prisma.contact.findMany.mockResolvedValueOnce([]);
    prisma.debt.findMany.mockResolvedValueOnce([
      debtRow({ id: "debt-1", debtorId: "debtor-1" }),
      debtRow({ id: "debt-2", debtorId: "debtor-2" }),
      debtRow({ id: "debt-3", debtorId: "debtor-3" })
    ]);

    const result = await queryUncontactedDebts(prisma as unknown as PrismaService, "tenant-1", 1, 2);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
  });
});
