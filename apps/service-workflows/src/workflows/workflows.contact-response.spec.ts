import { describe, expect, it, vi, beforeEach } from "vitest";
import { WorkflowsService } from "./workflows.service";

function makePrisma() {
  return {
    debt: {
      findFirst: vi.fn().mockResolvedValue({
        id: "debt1",
        tenantId: "org1",
        status: "active",
        metadata: {}
      }),
      update: vi.fn().mockResolvedValue({})
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ settings: {} })
    }
  };
}

function makeKafka() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function makeAudit() {
  return { logContactLifecycle: vi.fn().mockResolvedValue(undefined) };
}

function makeCompliance() {
  return { isChannelEligible: vi.fn(), checkContact: vi.fn() };
}

function makeRules() {
  return { matchesCondition: vi.fn() };
}

function makeConfig() {
  return { get: vi.fn().mockReturnValue(undefined) };
}

describe("WorkflowsService — ciclo de respuesta de contacto", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let kafka: ReturnType<typeof makeKafka>;
  let audit: ReturnType<typeof makeAudit>;
  let service: WorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    kafka = makeKafka();
    audit = makeAudit();
    service = new WorkflowsService(
      prisma as never,
      kafka as never,
      makeRules() as never,
      makeConfig() as never,
      makeCompliance() as never,
      audit as never
    );
  });

  describe("handleContactEffective", () => {
    it("transiciona la deuda a 'contacted' vía CONTACT_EFFECTIVE", async () => {
      await service.handleContactEffective("org1", { debt_id: "debt1" });

      expect(prisma.debt.update).toHaveBeenCalledWith({
        where: { id: "debt1" },
        data: { status: "contacted" }
      });
    });

    it("no hace nada sin debt_id", async () => {
      await service.handleContactEffective("org1", {});

      expect(prisma.debt.update).not.toHaveBeenCalled();
    });
  });

  describe("handleContactNoResponse", () => {
    it("reintenta por el siguiente canal cuando quedan intentos disponibles", async () => {
      await service.handleContactNoResponse("org1", {
        debt_id: "debt1",
        debtor_id: "debtor1",
        channel: "whatsapp",
        attempt_number: 1
      });

      expect(kafka.publish).toHaveBeenCalledWith(
        "cobrai.debtor.contact_queue",
        "org1",
        expect.objectContaining({
          debt_id: "debt1",
          debtor_id: "debtor1",
          attempt_number: 2,
          previous_channel: "whatsapp",
          escalation: "switch_channel"
        })
      );
      expect(audit.logContactLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ action: "compliance.contact.retry_scheduled" })
      );
      expect(prisma.debt.update).not.toHaveBeenCalled();
    });

    it("escala la deuda al agotar el máximo de intentos configurado", async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce({
        settings: { contactRetryPolicy: { maxAttempts: 3 } }
      });

      await service.handleContactNoResponse("org1", {
        debt_id: "debt1",
        debtor_id: "debtor1",
        channel: "voice",
        attempt_number: 3
      });

      expect(prisma.debt.update).toHaveBeenCalledWith({
        where: { id: "debt1" },
        data: { status: "legal_risk" }
      });
      expect(kafka.publish).toHaveBeenCalledWith(
        "cobrai.debt.escalated",
        "org1",
        expect.objectContaining({ debt_id: "debt1", target: "legal_risk" })
      );
      expect(audit.logContactLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ action: "compliance.contact.escalated" })
      );
    });

    it("escala a un agente humano sin tocar el estado de la deuda cuando escalateTo=human", async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce({
        settings: { contactRetryPolicy: { maxAttempts: 3, escalateTo: "human" } }
      });

      await service.handleContactNoResponse("org1", {
        debt_id: "debt1",
        debtor_id: "debtor1",
        channel: "whatsapp",
        attempt_number: 3
      });

      expect(prisma.debt.update).not.toHaveBeenCalled();
      expect(kafka.publish).toHaveBeenCalledWith(
        "cobrai.debt.escalated",
        "org1",
        expect.objectContaining({ debt_id: "debt1", target: "human" })
      );
      expect(audit.logContactLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "compliance.contact.escalated",
          escalationTarget: "human"
        })
      );
    });

    it("no hace nada sin debt_id o debtor_id", async () => {
      await service.handleContactNoResponse("org1", { debt_id: "debt1" });

      expect(kafka.publish).not.toHaveBeenCalled();
      expect(prisma.debt.update).not.toHaveBeenCalled();
    });
  });
});
