import { describe, expect, it, vi, beforeEach } from "vitest";
import { ContactRetrySweepService } from "./contact-retry-sweep.service";

function makePrisma() {
  return {
    tenant: {
      findMany: vi.fn().mockResolvedValue([{ id: "org1", settings: {} }])
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([])
    }
  };
}

function makeContacts() {
  return {
    markContactExpired: vi.fn().mockResolvedValue(undefined)
  };
}

describe("ContactRetrySweepService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let contacts: ReturnType<typeof makeContacts>;
  let service: ContactRetrySweepService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    contacts = makeContacts();
    service = new ContactRetrySweepService(prisma as never, contacts as never);
  });

  it("no hace nada si no hay contactos pendientes vencidos", async () => {
    await service.sweepExpiredContacts();

    expect(contacts.markContactExpired).not.toHaveBeenCalled();
  });

  it("marca como expirado cada contacto pendiente vencido por tenant", async () => {
    prisma.contact.findMany.mockResolvedValueOnce([
      { id: "contact1" },
      { id: "contact2" }
    ]);

    await service.sweepExpiredContacts();

    expect(contacts.markContactExpired).toHaveBeenCalledTimes(2);
    expect(contacts.markContactExpired).toHaveBeenCalledWith("org1", "contact1");
    expect(contacts.markContactExpired).toHaveBeenCalledWith("org1", "contact2");
  });

  it("usa la ventana de horas configurada por tenant para calcular el corte", async () => {
    prisma.tenant.findMany.mockResolvedValueOnce([
      { id: "org1", settings: { contactRetryPolicy: { windowHours: 48 } } }
    ]);

    await service.sweepExpiredContacts();

    const call = prisma.contact.findMany.mock.calls[0]![0] as {
      where: { startedAt: { lte: Date } };
    };
    const cutoff = call.where.startedAt.lte;
    const hoursAgo = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60);
    expect(hoursAgo).toBeGreaterThan(47);
    expect(hoursAgo).toBeLessThan(49);
  });

  it("procesa cada tenant de forma independiente", async () => {
    prisma.tenant.findMany.mockResolvedValueOnce([
      { id: "org1", settings: {} },
      { id: "org2", settings: {} }
    ]);
    prisma.contact.findMany
      .mockResolvedValueOnce([{ id: "contactA" }])
      .mockResolvedValueOnce([{ id: "contactB" }]);

    await service.sweepExpiredContacts();

    expect(contacts.markContactExpired).toHaveBeenCalledWith("org1", "contactA");
    expect(contacts.markContactExpired).toHaveBeenCalledWith("org2", "contactB");
  });
});
