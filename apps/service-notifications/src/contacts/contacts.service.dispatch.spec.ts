import { describe, expect, it, vi, beforeEach } from "vitest";
import { ContactsService } from "./contacts.service";
import {
  makeAudit,
  makeCompliance,
  makeConfig,
  makeDebtorMemory,
  makeEmail,
  makeIntegrations,
  makeKafka,
  makePrisma,
  makeSms,
  makeVoice,
  makeWaterfall,
  makeWhatsapp
} from "./contacts.service.fixtures";

// D-17: a simulated send must be marked as such wherever it lands in the
// database, so it never inflates delivery metrics nor consumes the Ley 1266
// contact quota. This suite lives apart from contacts.service.spec.ts because
// that file (and its former single spec) is already over the project's
// 300-line hard limit and must not grow further.
describe("ContactsService — simulated flag persistence (D-17)", () => {
  let service: ContactsService;
  let prisma: ReturnType<typeof makePrisma>;
  let whatsapp: ReturnType<typeof makeWhatsapp>;

  function build() {
    service = new ContactsService(
      prisma as never,
      makeCompliance() as never,
      makeAudit() as never,
      makeEmail() as never,
      makeSms() as never,
      whatsapp as never,
      makeVoice() as never,
      makeKafka() as never,
      makeWaterfall() as never,
      makeConfig() as never,
      makeDebtorMemory() as never,
      makeIntegrations() as never
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    whatsapp = makeWhatsapp();
    build();
  });

  it("adapter result con simulated: true → Contact.simulated persistido como true", async () => {
    whatsapp.sendTemplate.mockResolvedValueOnce({
      message_id: "sandbox-1",
      status: "sent",
      simulated: true
    });

    await service.executeContact("org1", { debt_id: "debt1", channel: "whatsapp" });

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ simulated: true })
      })
    );
  });

  it("adapter result con simulated: true → Message.simulated persistido como true", async () => {
    whatsapp.sendTemplate.mockResolvedValueOnce({
      message_id: "sandbox-1",
      status: "sent",
      simulated: true
    });

    await service.executeContact("org1", { debt_id: "debt1", channel: "whatsapp" });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ simulated: true })
      })
    );
  });

  it("anti-regresión: envío real (sin simulated en el resultado) → Contact.simulated es false", async () => {
    // Existing adapter mocks never set `simulated` — this is the pre-plan world.
    await service.executeContact("org1", { debt_id: "debt1", channel: "whatsapp" });

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ simulated: false })
      })
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ simulated: false })
      })
    );
  });
});
