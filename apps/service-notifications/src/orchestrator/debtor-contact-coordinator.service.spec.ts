import { describe, expect, it, vi, beforeEach } from "vitest";
import { DebtorContactCoordinatorService } from "./debtor-contact-coordinator.service";

function makePrisma() {
  return {
    contact: {
      findFirst: vi.fn().mockResolvedValue(null)
    },
    debt: {
      findFirst: vi.fn().mockResolvedValue({
        id: "debt1",
        externalRef: "EXT-1",
        amountOutstanding: 100000,
        currency: "COP",
        dueDate: new Date("2026-01-01")
      })
    }
  };
}

function makeCompliance() {
  return {
    getRetryState: vi.fn().mockResolvedValue({ allowed: true })
  };
}

function makeDebtorMemory() {
  return {
    registerPendingDebt: vi.fn().mockResolvedValue(undefined)
  };
}

function makeContacts() {
  return {
    handleContactRequested: vi.fn().mockResolvedValue(undefined)
  };
}

describe("DebtorContactCoordinatorService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let compliance: ReturnType<typeof makeCompliance>;
  let debtorMemory: ReturnType<typeof makeDebtorMemory>;
  let contacts: ReturnType<typeof makeContacts>;
  let service: DebtorContactCoordinatorService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    compliance = makeCompliance();
    debtorMemory = makeDebtorMemory();
    contacts = makeContacts();
    service = new DebtorContactCoordinatorService(
      prisma as never,
      compliance as never,
      debtorMemory as never,
      contacts as never
    );
  });

  it("ejecuta el contacto primario cuando el deudor no tiene nada en curso", async () => {
    await service.handleQueuedRequest("org1", {
      debt_id: "debt1",
      debtor_id: "debtor1"
    });

    expect(contacts.handleContactRequested).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ debt_id: "debt1", debtor_id: "debtor1" })
    );
    expect(debtorMemory.registerPendingDebt).not.toHaveBeenCalled();
  });

  it("difiere una deuda distinta cuando el deudor ya tiene un contacto en curso", async () => {
    compliance.getRetryState.mockResolvedValueOnce({
      allowed: false,
      reason: "awaiting_response"
    });
    prisma.contact.findFirst.mockResolvedValueOnce({ debtId: "other-debt" });

    await service.handleQueuedRequest("org1", {
      debt_id: "debt1",
      debtor_id: "debtor1"
    });

    expect(contacts.handleContactRequested).not.toHaveBeenCalled();
    expect(debtorMemory.registerPendingDebt).toHaveBeenCalledWith(
      "org1",
      "debtor1",
      expect.objectContaining({ debtId: "debt1" })
    );
  });

  it("ignora el redisparo cuando el contacto en curso es exactamente la misma deuda", async () => {
    compliance.getRetryState.mockResolvedValueOnce({
      allowed: false,
      reason: "retry_cooldown"
    });
    prisma.contact.findFirst.mockResolvedValueOnce({ debtId: "debt1" });

    await service.handleQueuedRequest("org1", {
      debt_id: "debt1",
      debtor_id: "debtor1"
    });

    expect(contacts.handleContactRequested).not.toHaveBeenCalled();
    expect(debtorMemory.registerPendingDebt).not.toHaveBeenCalled();
  });

  it("propaga attempt_number/previous_channel/escalation al ejecutar el contacto", async () => {
    await service.handleQueuedRequest("org1", {
      debt_id: "debt1",
      debtor_id: "debtor1",
      attempt_number: 2,
      previous_channel: "whatsapp",
      escalation: "switch_channel"
    });

    expect(contacts.handleContactRequested).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        attempt_number: 2,
        previous_channel: "whatsapp",
        escalation: "switch_channel"
      })
    );
  });

  it("ignora payloads inválidos sin debt_id o debtor_id", async () => {
    await service.handleQueuedRequest("org1", { debt_id: "", debtor_id: "" });

    expect(compliance.getRetryState).not.toHaveBeenCalled();
    expect(contacts.handleContactRequested).not.toHaveBeenCalled();
  });
});
