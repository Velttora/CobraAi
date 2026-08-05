import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { TwilioWhatsAppAdapter } from "./twilio-whatsapp.adapter";

const mockCreate = vi.fn();
const mockTwilioFactory = vi.fn((_sid?: string, _token?: string) => ({
  messages: { create: mockCreate }
}));

vi.mock("twilio", () => ({
  default: (sid?: string, token?: string) => mockTwilioFactory(sid, token)
}));

const mockPrisma = {
  contactConsent: { findFirst: vi.fn() }
};

function makeIntegrations(overrides: { resolveByChannel?: ReturnType<typeof vi.fn> } = {}) {
  return {
    resolveByChannel:
      overrides.resolveByChannel ??
      vi.fn().mockResolvedValue({
        secrets: { accountSid: "ACtest", authToken: "authtest" },
        publicConfig: { fromNumber: "whatsapp:+14155238886" }
      })
  };
}

describe("TwilioWhatsAppAdapter", () => {
  let integrations: ReturnType<typeof makeIntegrations>;
  let adapter: TwilioWhatsAppAdapter;
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ sid: "SMtest123" });
    integrations = makeIntegrations();
    adapter = new TwilioWhatsAppAdapter(integrations as never, mockPrisma as never);
    originalEnv = process.env.SIMULATE_OUTBOUND_SENDS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SIMULATE_OUTBOUND_SENDS;
    else process.env.SIMULATE_OUTBOUND_SENDS = originalEnv;
  });

  it("sin integración verificada y simulación apagada → status failed, no llama a la API", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce(null);
    delete process.env.SIMULATE_OUTBOUND_SENDS;

    const result = await adapter.sendTemplate({
      to: "+573001234567",
      template_id: "recordatorio",
      variables: { nombre: "Juan" },
      tenant_id: "org_test"
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ message_id: "", status: "failed" });
  });

  it("sin integración verificada y simulación encendida → sent simulado", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce(null);
    process.env.SIMULATE_OUTBOUND_SENDS = "true";

    const result = await adapter.sendTemplate({
      to: "+573001234567",
      template_id: "recordatorio",
      variables: { nombre: "Juan" },
      tenant_id: "org_test"
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.status).toBe("sent");
    expect(result.simulated).toBe(true);
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

  it("dos tenants distintos → dos clientes Twilio construidos con su propio accountSid", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce({
      secrets: { accountSid: "AC_tenant_A", authToken: "token_A" },
      publicConfig: { fromNumber: "whatsapp:+10000000001" }
    });
    await adapter.sendTemplate({
      to: "+573001234567",
      template_id: "recordatorio",
      variables: {},
      tenant_id: "tenant_A"
    });

    integrations.resolveByChannel.mockResolvedValueOnce({
      secrets: { accountSid: "AC_tenant_B", authToken: "token_B" },
      publicConfig: { fromNumber: "whatsapp:+10000000002" }
    });
    await adapter.sendTemplate({
      to: "+573007654321",
      template_id: "recordatorio",
      variables: {},
      tenant_id: "tenant_B"
    });

    expect(mockTwilioFactory).toHaveBeenNthCalledWith(1, "AC_tenant_A", "token_A");
    expect(mockTwilioFactory).toHaveBeenNthCalledWith(2, "AC_tenant_B", "token_B");
  });

  it("usa publicConfig.fromNumber del tenant resuelto como From", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce({
      secrets: { accountSid: "ACtest", authToken: "authtest" },
      publicConfig: { fromNumber: "whatsapp:+19998887777" }
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
