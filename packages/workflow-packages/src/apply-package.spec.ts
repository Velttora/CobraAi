import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPackageToPortfolio,
  resolveAppliedById
} from "./apply-package";
import { resetWorkflowPackageCache } from "./registry";

describe("resolveAppliedById", () => {
  const prisma = {
    user: {
      findUnique: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined for empty userId", async () => {
    await expect(resolveAppliedById(prisma as never, "")).resolves.toBeUndefined();
    await expect(resolveAppliedById(prisma as never, "  ")).resolves.toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns user id when user exists", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user_demo_admin" });
    await expect(
      resolveAppliedById(prisma as never, "user_demo_admin")
    ).resolves.toBe("user_demo_admin");
  });

  it("returns undefined when user is missing", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      resolveAppliedById(prisma as never, "user_clerk_unknown")
    ).resolves.toBeUndefined();
  });
});

describe("applyPackageToPortfolio", () => {
  beforeEach(() => {
    resetWorkflowPackageCache();
  });

  it("skips appliedById when user does not exist", async () => {
    const creates: unknown[] = [];
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      portfolio: {
        findFirst: vi.fn().mockResolvedValue({ id: "p1", tenantId: "t1" }),
        update: vi.fn().mockResolvedValue({})
      },
      workflowRule: {
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      portfolioPackageApplication: {
        create: vi.fn().mockImplementation(({ data }) => {
          creates.push(data);
          return Promise.resolve(data);
        })
      }
    };

    await applyPackageToPortfolio(prisma as never, {
      tenantId: "t1",
      portfolioId: "p1",
      packageId: "pyme_fintech",
      overwrite: true,
      appliedById: "user_clerk_unknown"
    });

    expect(prisma.workflowRule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Date)
        })
      })
    );
    expect(creates[0]).toMatchObject({
      appliedById: undefined,
      packageSlug: "pyme_fintech"
    });
  });
});
