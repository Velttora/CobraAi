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

function makePrisma(aiSegment: string | null) {
  const debtRow = {
    id: "debt1",
    tenantId: "org1",
    portfolioId: "p1",
    debtorId: "debtor1",
    status: "new",
    bestChannel: "whatsapp",
    priorityScore: 50,
    aiSegment,
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

function build(
  prisma: ReturnType<typeof makePrisma>,
  kafka: ReturnType<typeof makeKafka>,
  compliance: ReturnType<typeof makeCompliance>
) {
  return new WorkflowsService(
    prisma as never,
    kafka as never,
    new RuleEngineService() as never,
    makeConfig() as never,
    compliance as never,
    makeAudit() as never
  );
}

describe("WorkflowsService — bloqueo por segmento critical", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deuda aiSegment=critical → NO encola contacto, aunque la regla matchee", async () => {
    const prisma = makePrisma("critical");
    const kafka = makeKafka();
    const compliance = makeCompliance();
    const service = build(prisma, kafka, compliance);

    await service.handleDebtCreated("org1", { debt_id: "debt1", status: "new" });

    const contactQueueCalls = kafka.publish.mock.calls.filter(
      ([topic]) => topic === "cobrai.debtor.contact_queue"
    );
    expect(contactQueueCalls).toHaveLength(0);
    // El chequeo de compliance (isChannelEligible) ni se llega a evaluar: el
    // segmento corta antes, así que tampoco debe haberse consultado.
    expect(compliance.isChannelEligible).not.toHaveBeenCalled();
  });

  it("deuda aiSegment=critical → registra WorkflowExecution skipped con reason segment_critical", async () => {
    const prisma = makePrisma("critical");
    const kafka = makeKafka();
    const compliance = makeCompliance();
    const service = build(prisma, kafka, compliance);

    await service.handleDebtCreated("org1", { debt_id: "debt1", status: "new" });

    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exec1" },
        data: expect.objectContaining({
          status: "skipped",
          result: expect.objectContaining({
            blocked: true,
            reason: "segment_critical",
            channel: "whatsapp"
          })
        })
      })
    );
  });

  it("deuda aiSegment=critical → escala a humano (cobrai.debt.escalated)", async () => {
    const prisma = makePrisma("critical");
    const kafka = makeKafka();
    const compliance = makeCompliance();
    const service = build(prisma, kafka, compliance);

    await service.handleDebtCreated("org1", { debt_id: "debt1", status: "new" });

    expect(kafka.publish).toHaveBeenCalledWith(
      "cobrai.debt.escalated",
      "org1",
      expect.objectContaining({ debt_id: "debt1", target: "human" })
    );
  });

  it("deuda aiSegment=high (no critical) → sigue encolando contacto normalmente", async () => {
    const prisma = makePrisma("high");
    const kafka = makeKafka();
    const compliance = makeCompliance();
    const service = build(prisma, kafka, compliance);

    await service.handleDebtCreated("org1", { debt_id: "debt1", status: "new" });

    expect(kafka.publish).toHaveBeenCalledWith(
      "cobrai.debtor.contact_queue",
      "org1",
      expect.objectContaining({
        debt_id: "debt1",
        channel: "whatsapp",
        attempt_number: 1,
        execution_id: "exec1"
      }),
      "debtor1"
    );
  });

  it("getRetryState bloqueado → no encola y marca skipped", async () => {
    const prisma = makePrisma("high");
    const kafka = makeKafka();
    const compliance = makeCompliance();
    compliance.getRetryState.mockResolvedValue({
      allowed: false,
      reason: "awaiting_response"
    });
    const service = build(prisma, kafka, compliance);

    await service.handleDebtCreated("org1", { debt_id: "debt1", status: "new" });

    const contactQueueCalls = kafka.publish.mock.calls.filter(
      ([topic]) => topic === "cobrai.debtor.contact_queue"
    );
    expect(contactQueueCalls).toHaveLength(0);
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "skipped",
          result: expect.objectContaining({
            blocked: true,
            reason: "awaiting_response"
          })
        })
      })
    );
  });

  it("último contacto no_response → encola con attempt_number acumulado", async () => {
    const prisma = makePrisma("high");
    prisma.contact.findFirst.mockResolvedValue({
      responseStatus: "no_response",
      attemptNumber: 2
    });
    const kafka = makeKafka();
    const compliance = makeCompliance();
    const service = build(prisma, kafka, compliance);

    await service.handleDebtCreated("org1", { debt_id: "debt1", status: "new" });

    expect(kafka.publish).toHaveBeenCalledWith(
      "cobrai.debtor.contact_queue",
      "org1",
      expect.objectContaining({ attempt_number: 3, execution_id: "exec1" }),
      "debtor1"
    );
  });

  it("attempt_number > maxAttempts → no encola y marca skipped", async () => {
    const prisma = makePrisma("high");
    prisma.contact.findFirst.mockResolvedValue({
      responseStatus: "no_response",
      attemptNumber: 3
    });
    const kafka = makeKafka();
    const compliance = makeCompliance();
    const service = build(prisma, kafka, compliance);

    await service.handleDebtCreated("org1", { debt_id: "debt1", status: "new" });

    const contactQueueCalls = kafka.publish.mock.calls.filter(
      ([topic]) => topic === "cobrai.debtor.contact_queue"
    );
    expect(contactQueueCalls).toHaveLength(0);
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "skipped",
          result: expect.objectContaining({
            reason: "max_attempts_reached"
          })
        })
      })
    );
  });
});

const SCHEDULE_RULE = {
  id: "rule-schedule",
  tenantId: "org1",
  portfolioId: "p1",
  name: "Pre-vencimiento WhatsApp",
  trigger: "schedule",
  condition: { days_to_due: { gte: 1, lte: 7 } },
  action: "send_notification",
  channel: "whatsapp",
  templateId: null,
  priority: 28,
  isActive: true,
  deletedAt: null
};

function makeSchedulePrisma(todayExecStatuses: Array<"completed" | "skipped"> = []) {
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 3);
  const debtRow = {
    id: "debt1",
    tenantId: "org1",
    portfolioId: "p1",
    debtorId: "debtor1",
    status: "upcoming",
    bestChannel: "whatsapp",
    priorityScore: 50,
    aiSegment: "medium",
    dueDate: due,
    amountOutstanding: 100_000,
    metadata: {},
    debtor: { whatsappOptIn: true, consents: [] }
  };
  return {
    debt: {
      findFirst: vi.fn().mockResolvedValue(debtRow),
      findMany: vi.fn().mockResolvedValue([debtRow]),
      update: vi.fn().mockResolvedValue(debtRow)
    },
    portfolio: {
      findMany: vi.fn().mockResolvedValue([
        { id: "p1", automationStatus: "package", automationStartsAt: null }
      ]),
      findFirst: vi.fn().mockResolvedValue({
        automationStatus: "package",
        automationStartsAt: null
      })
    },
    workflowRule: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockImplementation(({ where }: { where: { trigger?: string } }) => {
        if (where.trigger === "schedule") return Promise.resolve([SCHEDULE_RULE]);
        if (where.trigger === "debt_created") return Promise.resolve([]);
        return Promise.resolve([]);
      })
    },
    workflowExecution: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(todayExecStatuses.map((status) => ({ status }))),
      create: vi.fn().mockResolvedValue({ id: "exec1" }),
      update: vi.fn().mockResolvedValue({})
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(null)
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ settings: {} })
    },
    promiseToPay: {
      count: vi.fn().mockResolvedValue(0)
    }
  };
}

describe("WorkflowsService — dedup diario del schedule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("si ya hay completed hoy para deuda+regla → no crea otra ejecución", async () => {
    const prisma = makeSchedulePrisma(["completed"]);
    const kafka = makeKafka();
    const compliance = makeCompliance();
    const service = build(prisma, kafka, compliance);

    const result = await service.evaluateTenant("org1");

    expect(result.contacts).toBe(0);
    expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    expect(kafka.publish).not.toHaveBeenCalled();
  });

  it("si ya hay skipped hoy y getRetryState bloquea → no crea otra ejecución", async () => {
    const prisma = makeSchedulePrisma(["skipped"]);
    const kafka = makeKafka();
    const compliance = makeCompliance();
    compliance.getRetryState.mockResolvedValue({
      allowed: false,
      reason: "awaiting_response"
    });
    const service = build(prisma, kafka, compliance);

    const result = await service.evaluateTenant("org1");

    expect(result.contacts).toBe(0);
    expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
  });

  it("sin ejecuciones hoy y retry allowed → encola una vez", async () => {
    const prisma = makeSchedulePrisma([]);
    const kafka = makeKafka();
    const compliance = makeCompliance();
    const service = build(prisma, kafka, compliance);

    const result = await service.evaluateTenant("org1");

    expect(result.contacts).toBe(1);
    expect(prisma.workflowExecution.create).toHaveBeenCalledTimes(1);
    expect(kafka.publish).toHaveBeenCalledWith(
      "cobrai.debtor.contact_queue",
      "org1",
      expect.objectContaining({
        debt_id: "debt1",
        attempt_number: 1,
        execution_id: "exec1"
      }),
      "debtor1"
    );
  });
});
