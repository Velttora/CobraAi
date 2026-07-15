import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

vi.mock("@cobrai/db", () => ({
  ensureTenantRecord: vi.fn().mockResolvedValue(undefined),
  PrismaService: class {}
}));

import { TenantService } from "./tenant.service";

describe("TenantService.updateContactRetryPolicy", () => {
  const prisma = {
    tenant: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    $queryRaw: vi.fn()
  };
  const config = { get: vi.fn() };

  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantService(prisma as never, config as never);
  });

  it("rechaza usuarios que no son admin", async () => {
    await expect(
      service.updateContactRetryPolicy("org1", { maxAttempts: 5 }, "agent")
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("lanza NotFoundException si el tenant no existe", async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);

    await expect(
      service.updateContactRetryPolicy("org1", { maxAttempts: 5 }, "admin")
    ).rejects.toThrow(NotFoundException);
  });

  it("hace merge parcial preservando otras llaves de settings y la política previa", async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: "org1",
      settings: {
        contactRetryPolicy: {
          windowHours: 48,
          maxAttempts: 3,
          escalation: "same_channel",
          escalateTo: "human"
        },
        other_key: "preserved"
      }
    });
    prisma.tenant.update.mockResolvedValue({
      id: "org1",
      name: "Acme",
      slug: "acme",
      plan: "trial",
      settings: {
        contactRetryPolicy: {
          windowHours: 48,
          maxAttempts: 5,
          escalation: "same_channel",
          escalateTo: "human"
        },
        other_key: "preserved"
      }
    });

    const result = await service.updateContactRetryPolicy(
      "org1",
      { maxAttempts: 5 },
      "admin"
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: {
        settings: {
          contactRetryPolicy: {
            windowHours: 48,
            maxAttempts: 5,
            escalation: "same_channel",
            escalateTo: "human"
          },
          other_key: "preserved"
        }
      }
    });
    expect(result.contactRetryPolicy.maxAttempts).toBe(5);
    expect(result.contactRetryPolicy.windowHours).toBe(48);
    expect(result.contactRetryPolicy.escalateTo).toBe("human");
  });

  it("permite cambiar escalateTo a human sin tocar el resto de la política", async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: "org1",
      settings: {
        contactRetryPolicy: {
          windowHours: 24,
          maxAttempts: 3,
          escalation: "switch_channel",
          escalateTo: "legal_risk"
        }
      }
    });
    prisma.tenant.update.mockImplementation(({ data }: { data: { settings: unknown } }) => ({
      id: "org1",
      name: "Acme",
      slug: "acme",
      plan: "trial",
      settings: data.settings
    }));

    const result = await service.updateContactRetryPolicy(
      "org1",
      { escalateTo: "human" },
      "admin"
    );

    expect(result.contactRetryPolicy).toEqual({
      windowHours: 24,
      maxAttempts: 3,
      escalation: "switch_channel",
      escalateTo: "human"
    });
  });
});

describe("TenantService.updateWhatsappSender", () => {
  const prisma = {
    tenant: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    $queryRaw: vi.fn()
  };
  const config = { get: vi.fn() };

  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    service = new TenantService(prisma as never, config as never);
  });

  it("rechaza usuarios que no son admin", async () => {
    await expect(
      service.updateWhatsappSender(
        "org1",
        { whatsappFromNumber: "+14155551234" },
        "agent"
      )
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("rechaza un número con formato inválido", async () => {
    await expect(
      service.updateWhatsappSender(
        "org1",
        { whatsappFromNumber: "no-es-un-numero" },
        "admin"
      )
    ).rejects.toThrow(BadRequestException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("rechaza un número ya asignado a otra organización", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: "org2", name: "Otra Empresa" }]);

    await expect(
      service.updateWhatsappSender(
        "org1",
        { whatsappFromNumber: "+14155551234" },
        "admin"
      )
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("asigna el número propio normalizado, preservando el resto de settings", async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: "org1",
      settings: { contactRetryPolicy: { maxAttempts: 3 } }
    });
    prisma.tenant.update.mockImplementation(({ data }: { data: { settings: Record<string, unknown> } }) => ({
      id: "org1",
      name: "Acme",
      slug: "acme",
      plan: "trial",
      settings: data.settings
    }));

    const result = await service.updateWhatsappSender(
      "org1",
      { whatsappFromNumber: "+14155551234" },
      "admin"
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: "org1" },
      data: {
        settings: {
          contactRetryPolicy: { maxAttempts: 3 },
          whatsappFromNumber: "whatsapp:+14155551234"
        }
      }
    });
    expect(result.whatsappFromNumber).toBe("whatsapp:+14155551234");
  });

  it("limpia el número (null) sin validar conflicto", async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: "org1", settings: {} });
    prisma.tenant.update.mockImplementation(({ data }: { data: { settings: Record<string, unknown> } }) => ({
      id: "org1",
      name: "Acme",
      slug: "acme",
      plan: "trial",
      settings: data.settings
    }));

    const result = await service.updateWhatsappSender(
      "org1",
      { whatsappFromNumber: null },
      "admin"
    );

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.whatsappFromNumber).toBeNull();
  });

  it("lanza NotFoundException si el tenant no existe", async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);

    await expect(
      service.updateWhatsappSender(
        "org1",
        { whatsappFromNumber: "+14155551234" },
        "admin"
      )
    ).rejects.toThrow(NotFoundException);
  });
});
