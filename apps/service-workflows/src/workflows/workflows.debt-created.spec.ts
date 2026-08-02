import { describe, expect, it, vi, beforeEach } from "vitest";
import { WorkflowsService } from "./workflows.service";
import { RuleEngineService } from "../rule-engine/rule-engine.service";

const WELCOME_RULE = {
  id: "rule-welcome",
  tenantId: "org1",
  portfolioId: "p1",
  name: "Bienvenida — WhatsApp",
  trigger: "debt_created",
  condition: { status: "new" },
  action: "send_notification",
  channel: "whatsapp",
  templateId: null,
  priority: 10,
  isActive: true,
  deletedAt: null
};

/**
 * Simula el estado de la BD tras el scoring síncrono de service-portfolios:
 * la deuda ya está en "active" cuando el consumidor procesa cobrai.debt.created.
 */
function makePrisma(dbStatus = "active") {
  const debtRow = {
    id: "debt1",
    tenantId: "org1",
    portfolioId: "p1",
    debtorId: "debtor1",
    status: dbStatus,
    bestChannel: "whatsapp",
    priorityScore: 50,
    metadata: {},
    debtor: { whatsappOptIn: true }
  };
  return {
    debt: {
      findFirst: vi.fn().mockResolvedValue(debtRow),
      update: vi.fn().mockResolvedValue(debtRow)
    },
    portfolio: {
      findFirst: vi.fn().mockResolvedValue({
        automationStatus: "package",
        automationStartsAt: null
      })
    },
    workflowRule: {
      findMany: vi.fn().mockResolvedValue([WELCOME_RULE])
    },
    workflowExecution: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "exec1" }),
      update: vi.fn().mockResolvedValue({})
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(null)
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ settings: {} })
    }
  };
}

function makeKafka() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function makeCompliance() {
  return {
    isChannelEligible: vi.fn().mockResolvedValue({ allowed: true }),
    getRetryState: vi.fn().mockResolvedValue({ allowed: true }),
    checkContact: vi.fn()
  };
}

function makeConfig() {
  return { get: vi.fn().mockReturnValue(undefined) };
}

function makeAudit() {
  return { logContactLifecycle: vi.fn().mockResolvedValue(undefined) };
}

function build(prisma: ReturnType<typeof makePrisma>, kafka: ReturnType<typeof makeKafka>) {
  return new WorkflowsService(
    prisma as never,
    kafka as never,
    new RuleEngineService() as never,
    makeConfig() as never,
    makeCompliance() as never,
    makeAudit() as never
  );
}

describe("WorkflowsService — bienvenida en debt_created", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispara la bienvenida usando el status del evento aunque la deuda ya esté en 'active'", async () => {
    const prisma = makePrisma("active");
    const kafka = makeKafka();
    const service = build(prisma, kafka);

    await service.handleDebtCreated("org1", {
      debt_id: "debt1",
      status: "new"
    });

    expect(kafka.publish).toHaveBeenCalledWith(
      "cobrai.debtor.contact_queue",
      "org1",
      expect.objectContaining({ debt_id: "debt1", channel: "whatsapp" }),
      "debtor1"
    );
  });

  it("lee el status de la BD cuando el evento no lo trae (activación diferida)", async () => {
    const prisma = makePrisma("new");
    const kafka = makeKafka();
    const service = build(prisma, kafka);

    await service.handleDebtCreated("org1", {
      debt_id: "debt1",
      source: "deferred_activation"
    });

    expect(kafka.publish).toHaveBeenCalledWith(
      "cobrai.debtor.contact_queue",
      "org1",
      expect.objectContaining({ debt_id: "debt1", channel: "whatsapp" }),
      "debtor1"
    );
  });

  it.each(["future", "upcoming"])(
    "dispara la bienvenida para una deuda creada como '%s'",
    async (creationStatus) => {
      const prisma = makePrisma(creationStatus);
      const kafka = makeKafka();
      const service = build(prisma, kafka);

      await service.handleDebtCreated("org1", {
        debt_id: "debt1",
        status: creationStatus
      });

      expect(kafka.publish).toHaveBeenCalledWith(
        "cobrai.debtor.contact_queue",
        "org1",
        expect.objectContaining({ debt_id: "debt1", channel: "whatsapp" }),
        "debtor1"
      );
    }
  );

  it("no vuelve a saludar si la regla ya se ejecutó para esa deuda", async () => {
    const prisma = makePrisma("new");
    prisma.workflowExecution.findFirst.mockResolvedValue({ id: "exec-previo" });
    const kafka = makeKafka();
    const service = build(prisma, kafka);

    await service.handleDebtCreated("org1", {
      debt_id: "debt1",
      source: "deferred_activation"
    });

    const contactQueueCalls = kafka.publish.mock.calls.filter(
      ([topic]) => topic === "cobrai.debtor.contact_queue"
    );
    expect(contactQueueCalls).toHaveLength(0);
  });

  it("no dispara la bienvenida si el status de creación no es elegible (p. ej. contacted)", async () => {
    const prisma = makePrisma("contacted");
    const kafka = makeKafka();
    const service = build(prisma, kafka);

    await service.handleDebtCreated("org1", {
      debt_id: "debt1",
      status: "contacted"
    });

    const contactQueueCalls = kafka.publish.mock.calls.filter(
      ([topic]) => topic === "cobrai.debtor.contact_queue"
    );
    expect(contactQueueCalls).toHaveLength(0);
  });
});
