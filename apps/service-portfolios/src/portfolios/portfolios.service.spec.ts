import {
  BadRequestException,
  ConflictException,
  NotFoundException
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortfoliosService } from "./portfolios.service";

vi.mock("@cobrai/workflow-packages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cobrai/workflow-packages")>();
  return {
    ...actual,
    applyPackageToPortfolio: vi.fn(),
    deactivatePortfolioRules: vi.fn(),
    countActivePortfolioRules: vi.fn(),
    resolveAppliedById: vi.fn()
  };
});

import {
  applyPackageToPortfolio,
  countActivePortfolioRules,
  deactivatePortfolioRules,
  resolveAppliedById
} from "@cobrai/workflow-packages";

describe("PortfoliosService", () => {
  const prisma = {
    tenant: {
      upsert: vi.fn()
    },
    portfolio: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    },
    debt: {
      groupBy: vi.fn()
    },
    workflowRule: {
      groupBy: vi.fn()
    },
    user: {
      findUnique: vi.fn()
    },
    portfolioPackageApplication: {
      create: vi.fn()
    }
  };

  let service: PortfoliosService;

  const portfolioRecord = {
    id: "p1",
    tenantId: "org_1",
    name: "Test",
    automationStatus: "none",
    activePackageSlug: null,
    workflowRules: [],
    packageApplications: [],
    rulesCount: 0
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PortfoliosService(prisma as never);
    vi.mocked(resolveAppliedById).mockResolvedValue(undefined);
    prisma.tenant.upsert.mockResolvedValue({ id: "org_1" });
    prisma.portfolio.findFirst.mockResolvedValue(portfolioRecord);
    prisma.portfolioPackageApplication.create.mockResolvedValue({});
  });

  it("creates portfolio for tenant", async () => {
    prisma.portfolio.create.mockResolvedValue({ id: "p1", name: "Test" });
    const result = await service.create("org_1", { name: "Test" });
    expect(result.id).toBe("p1");
    expect(prisma.tenant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org_1" } })
    );
    expect(prisma.portfolio.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "org_1" }) })
    );
  });

  it("throws when portfolio missing", async () => {
    prisma.portfolio.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "missing")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("updateStrategy custom resolves appliedById before audit row", async () => {
    vi.mocked(resolveAppliedById).mockResolvedValue("user_demo_admin");

    await service.updateStrategy("org_1", "p1", { strategy: "custom" }, "user_clerk");

    expect(resolveAppliedById).toHaveBeenCalledWith(prisma, "user_clerk");
    expect(prisma.portfolioPackageApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "custom",
        appliedById: "user_demo_admin"
      })
    });
  });

  it("updateStrategy custom succeeds when clerk user is not in DB", async () => {
    vi.mocked(resolveAppliedById).mockResolvedValue(undefined);

    await service.updateStrategy("org_1", "p1", { strategy: "custom" }, "user_clerk");

    expect(prisma.portfolioPackageApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appliedById: undefined
      })
    });
  });

  it("updateStrategy package returns confirm_required when rules exist", async () => {
    vi.mocked(countActivePortfolioRules).mockResolvedValue(3);

    const result = await service.updateStrategy(
      "org_1",
      "p1",
      { strategy: "package", package_slug: "pyme_fintech" },
      "user_clerk"
    );

    expect(result).toMatchObject({
      confirm_required: true,
      existing_count: 3,
      package_id: "pyme_fintech"
    });
    expect(applyPackageToPortfolio).not.toHaveBeenCalled();
  });

  it("updateStrategy package requires package_slug", async () => {
    await expect(
      service.updateStrategy("org_1", "p1", { strategy: "package" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updateStrategy none deactivates rules", async () => {
    vi.mocked(deactivatePortfolioRules).mockResolvedValue(2);

    const result = await service.updateStrategy("org_1", "p1", { strategy: "none" });

    expect(deactivatePortfolioRules).toHaveBeenCalledWith(prisma, "org_1", "p1");
    expect(result).toMatchObject({
      automation_status: "none",
      confirm_required: false
    });
  });

  it("updateStrategy package maps PACKAGE_ALREADY_APPLIED to conflict", async () => {
    vi.mocked(countActivePortfolioRules).mockResolvedValue(0);
    const error = new Error("PACKAGE_ALREADY_APPLIED") as Error & {
      code: string;
      package_id: string;
      existing_count: number;
    };
    error.code = "PACKAGE_ALREADY_APPLIED";
    error.package_id = "pyme_fintech";
    error.existing_count = 2;
    vi.mocked(applyPackageToPortfolio).mockRejectedValue(error);

    await expect(
      service.updateStrategy(
        "org_1",
        "p1",
        { strategy: "package", package_slug: "pyme_fintech", overwrite: true }
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
