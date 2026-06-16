import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";

vi.mock("@cobrai/db", () => ({
  ensureTenantRecord: vi.fn().mockResolvedValue(undefined),
  PrismaService: class {}
}));

import { EmailLayoutService } from "./email-layout.service";

const TENANT = "org_abc";

describe("EmailLayoutService", () => {
  const prisma = {
    emailLayout: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    }
  };

  let service: EmailLayoutService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmailLayoutService(prisma as never);
  });

  describe("get", () => {
    it("returns the default layout as draft when no row exists", async () => {
      prisma.emailLayout.findUnique.mockResolvedValue(null);
      const res = await service.get(TENANT);
      expect(res.has_published).toBe(false);
      expect(res.published).toBeNull();
      expect(res.draft.blocks.length).toBeGreaterThan(0); // DEFAULT_EMAIL_LAYOUT
    });

    it("returns stored draft/published when present", async () => {
      prisma.emailLayout.findUnique.mockResolvedValue({
        draft: { blocks: [{ id: "b", type: "body", props: {} }], settings: {}, signature: {} },
        published: { blocks: [{ id: "b", type: "body", props: {} }], settings: {}, signature: {} },
        publishedAt: new Date("2026-06-16T00:00:00Z")
      });
      const res = await service.get(TENANT);
      expect(res.has_published).toBe(true);
      expect(res.published_at).toBe("2026-06-16T00:00:00.000Z");
      expect(res.draft.blocks).toHaveLength(1);
    });
  });

  describe("saveDraft", () => {
    it("rejects non-admins", async () => {
      await expect(
        service.saveDraft(TENANT, "viewer", { blocks: [] })
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.emailLayout.upsert).not.toHaveBeenCalled();
    });

    it("sanitizes and upserts the draft for admins (drops unknown blocks)", async () => {
      prisma.emailLayout.upsert.mockResolvedValue({});
      prisma.emailLayout.findUnique.mockResolvedValue(null);

      await service.saveDraft(
        TENANT,
        "org:admin",
        {
          blocks: [
            { id: "ok", type: "heading", props: { text: "Hola" } },
            { type: "evil", props: {} } // tipo desconocido → se descarta
          ],
          signature: { companyName: "Acme" }
        },
        "user_1"
      );

      const arg = prisma.emailLayout.upsert.mock.calls[0]?.[0] as {
        where: { tenantId: string };
        create: {
          draft: { blocks: { type: string }[]; signature: { companyName?: string } };
          updatedById?: string;
        };
      };
      expect(arg.where).toEqual({ tenantId: TENANT });
      const draft = arg.create.draft;
      expect(draft.blocks).toHaveLength(1);
      expect(draft.blocks[0]?.type).toBe("heading");
      expect(draft.signature.companyName).toBe("Acme");
      expect(arg.create.updatedById).toBe("user_1");
    });
  });

  describe("publish", () => {
    it("rejects non-admins", async () => {
      await expect(service.publish(TENANT, "viewer")).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it("copies the current draft into published with a timestamp", async () => {
      prisma.emailLayout.findUnique.mockResolvedValue({
        draft: { blocks: [{ id: "b", type: "body", props: {} }], settings: {}, signature: {} }
      });
      prisma.emailLayout.upsert.mockResolvedValue({});

      await service.publish(TENANT, "org:admin", "user_1");

      const arg = prisma.emailLayout.upsert.mock.calls[0]?.[0] as {
        update: { published: { blocks: unknown[] }; publishedAt: Date };
      };
      expect(arg.update.published.blocks).toHaveLength(1);
      expect(arg.update.publishedAt).toBeInstanceOf(Date);
    });
  });
});
