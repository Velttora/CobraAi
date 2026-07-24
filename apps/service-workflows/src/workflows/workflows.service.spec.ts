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
      findFirst: vi.fn().mockResolvedValue({ automationStatus: "package" })
    },
    workflowRule: {
      findMany: vi.fn().mockResolvedValue([WELCOME_RULE])
    },
    workflowExecution: {
      create: vi.fn().mockResolvedValue({ id: "exec1" }),
      update: vi.fn().mockResolvedValue({})
    }
  };
}

function makeKafka() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function makeCompliance() {
  return {
    isChannelEligible: vi.fn().mockResolvedValue({ allowed: true }),
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

    expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          debtId: "debt1",
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
      expect.objectContaining({ debt_id: "debt1", channel: "whatsapp" }),
      "debtor1"
    );
  });
});
