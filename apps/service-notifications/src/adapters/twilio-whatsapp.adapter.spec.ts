import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { TwilioWhatsAppAdapter } from "./twilio-whatsapp.adapter";

const mockCreate = vi.fn();
const mockPrisma = {
  contactConsent: { findFirst: vi.fn() },
  tenant: { findUnique: vi.fn().mockResolvedValue(null) }
};

vi.mock("twilio", () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate }
  }))
}));

function makeConfig(): ConfigService {
  const map: Record<string, string> = {
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "authtest",
    TWILIO_WA_FROM: "whatsapp:+14155238886"
  };
  return {
    get: (key: string) => map[key],
    getOrThrow: (key: string) => {
      const val = map[key];
      if (!val) throw new Error(`Missing config: ${key}`);
      return val;
    }
  } as unknown as ConfigService;
}

describe("TwilioWhatsAppAdapter", () => {
  let adapter: TwilioWhatsAppAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ sid: "SMtest123" });
    adapter = new TwilioWhatsAppAdapter(makeConfig(), mockPrisma as never);
  });

  it("sin credenciales Twilio → modo sandbox sin llamar a la API", async () => {
    const sandbox = new TwilioWhatsAppAdapter(
      { get: () => undefined } as unknown as ConfigService,
      mockPrisma as never
    );
    const result = await sandbox.sendTemplate({
      to: "+573001234567",
      template_id: "recordatorio",
      variables: { nombre: "Juan" },
      tenant_id: "org_test"
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.status).toBe("sent");
    expect(result.message_id).toMatch(/^sandbox-/);
  });

  it("sendTemplate con número sin prefijo → agrega whatsapp: y retorna message_id", async () => {
    const result = await adapter.sendTemplate({
      to: "+573001234567",
      template_id: "recordatorio",
      variables: { nombre: "Juan", monto: "100000", link_pago: "https://pay.test/1" },
      tenant_id: "org_test"
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "whatsapp:+573001234567" })
    );
    expect(result).toEqual({ message_id: "SMtest123", status: "sent" });
  });

  it("sendTemplate con número ya con prefijo → no duplica whatsapp:", async () => {
    await adapter.sendTemplate({
      to: "whatsapp:+573001234567",
      template_id: "recordatorio",
      variables: {},
      tenant_id: "org_test"
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "whatsapp:+573001234567" })
    );
  });

  it("sendTemplate cuando Twilio lanza excepción → retorna status: failed sin lanzar", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Twilio error"));
    const result = await adapter.sendTemplate({
      to: "+573001234567",
      template_id: "recordatorio",
      variables: {},
      tenant_id: "org_test"
    });
    expect(result.status).toBe("failed");
    expect(result.message_id).toBe("");
  });

  it("template recordatorio → renderiza mensaje con nombre y monto", async () => {
    await adapter.sendTemplate({
      to: "+573001234567",
      template_id: "cobrai_recordatorio_amable",
      variables: { nombre: "María", monto: "500000" },
      tenant_id: "org_test"
    });
    const callArg = mockCreate.mock.calls[0]?.[0] as { body: string };
    expect(callArg?.body).toContain("María");
    expect(callArg?.body).toContain("500000");
  });

  it("body pre-renderizado en variables → se usa directamente", async () => {
    await adapter.sendTemplate({
      to: "+573001234567",
      template_id: "agent_response",
      variables: { body: "Entendido, le confirmo su pago." },
      tenant_id: "org_test"
    });
    const callArg = mockCreate.mock.calls[0]?.[0] as { body: string };
    expect(callArg?.body).toBe("Entendido, le confirmo su pago.");
  });

  it("tenant con whatsappFromNumber propio → lo usa en vez del número compartido", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({
      settings: { whatsappFromNumber: "whatsapp:+19998887777" }
    });
    await adapter.sendTemplate({
      to: "+573001234567",
      template_id: "recordatorio",
      variables: {},
      tenant_id: "org_own_number"
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "whatsapp:+19998887777" })
    );
  });

  it("isOptedIn con consent en BD → retorna true", async () => {
    mockPrisma.contactConsent.findFirst.mockResolvedValueOnce({ id: "c1" });
    expect(await adapter.isOptedIn("+573001234567", "org_test")).toBe(true);
  });

  it("isOptedIn sin consent → retorna false", async () => {
    mockPrisma.contactConsent.findFirst.mockResolvedValueOnce(null);
    expect(await adapter.isOptedIn("+573001234567", "org_test")).toBe(false);
  });
});
