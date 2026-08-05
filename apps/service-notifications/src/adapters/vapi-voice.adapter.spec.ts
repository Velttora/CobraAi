import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { EMPRESA_FALLBACK } from "@cobrai/utils";

// Mock axios before importing adapter
vi.mock("axios", () => {
  const mockAxios = {
    post: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    defaults: { headers: { common: {} } },
  };
  return { default: mockAxios };
});

import axios from "axios";
import { VapiVoiceAdapter } from "./vapi-voice.adapter";

const mockedAxios = vi.mocked(axios);

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    VAPI_API_KEY: "vapi_test_key",
    VAPI_AGENT_ID: "agent-uuid-1234",
    ...overrides,
  };
  return {
    getOrThrow: vi.fn((key: string) => {
      if (key in values) return values[key];
      throw new Error(`Missing config: ${key}`);
    }),
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function makeIntegrations(overrides: { resolveByChannel?: ReturnType<typeof vi.fn> } = {}) {
  return {
    resolveByChannel:
      overrides.resolveByChannel ??
      vi.fn().mockResolvedValue({ publicConfig: { vapiPhoneNumberId: "phone-tenant-1" } })
  };
}

function makeInput(overrides: Partial<Parameters<VapiVoiceAdapter["initiateCall"]>[0]> = {}) {
  return {
    debt_id: "debt-abc-123",
    debtor_phone: "573001234567",
    strategy_context: {
      tenant_id: "tenant-1",
      strategy_id: "strategy-1",
      language: "es",
      segment: "medium" as const,
      preferred_channel: "voice" as const,
      variables: {
        nombre: "Juan Perez",
        monto: "150000",
        empresa: "CobraAI",
        due_date: "2026-06-01",
        link_pago: "https://pay.cobrai.dev/debt-abc-123",
      },
    },
    ...overrides,
  };
}

describe("VapiVoiceAdapter", () => {
  let integrations: ReturnType<typeof makeIntegrations>;
  let adapter: VapiVoiceAdapter;
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    integrations = makeIntegrations();
    adapter = new VapiVoiceAdapter(makeConfig(), integrations as never);
    originalEnv = process.env.SIMULATE_OUTBOUND_SENDS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SIMULATE_OUTBOUND_SENDS;
    else process.env.SIMULATE_OUTBOUND_SENDS = originalEnv;
  });

  it("sin credenciales Vapi (plataforma) → modo sandbox sin llamar a la API", async () => {
    const sandbox = new VapiVoiceAdapter(
      { get: () => undefined, getOrThrow: vi.fn() } as unknown as ConfigService,
      integrations as never
    );
    const result = await sandbox.initiateCall(makeInput());
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(result.status).toBe("queued");
    expect(result.call_id).toMatch(/^sandbox-/);
  });

  it("sin integración de voz verificada y simulación apagada → status failed, no llama a la API", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce(null);
    delete process.env.SIMULATE_OUTBOUND_SENDS;

    const result = await adapter.initiateCall(makeInput());

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(result).toEqual({ call_id: "", status: "failed" });
  });

  it("sin integración de voz verificada y simulación encendida → llama con VAPI_PHONE_NUMBER_ID global, marcado simulated", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce(null);
    process.env.SIMULATE_OUTBOUND_SENDS = "true";
    adapter = new VapiVoiceAdapter(makeConfig({ VAPI_PHONE_NUMBER_ID: "phone-global" }), integrations as never);
    (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { id: "call-sim-1", status: "queued" },
    });

    const result = await adapter.initiateCall(makeInput());

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ phoneNumberId: "phone-global" }),
      expect.anything()
    );
    expect(result).toEqual({ call_id: "call-sim-1", status: "queued", simulated: true });
  });

  describe("initiateCall", () => {
    it("llama a POST https://api.vapi.ai/call y retorna call_id", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-vapi-xyz", status: "queued" },
      });

      const result = await adapter.initiateCall(makeInput());

      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://api.vapi.ai/call",
        expect.objectContaining({
          assistantId: "agent-uuid-1234",
          phoneNumberId: "phone-tenant-1",
          customer: expect.objectContaining({ number: "+573001234567" }),
          metadata: expect.objectContaining({
            debt_id: "debt-abc-123",
            tenant_id: "tenant-1",
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer vapi_test_key",
          }),
        }),
      );

      expect(result).toEqual({ call_id: "call-vapi-xyz", status: "queued" });
    });

    it("dos tenants distintos → cada llamada usa el vapiPhoneNumberId de su propia integración", async () => {
      integrations.resolveByChannel.mockResolvedValueOnce({
        publicConfig: { vapiPhoneNumberId: "phone-tenant-A" }
      });
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-A", status: "queued" },
      });
      await adapter.initiateCall(makeInput({ strategy_context: { ...makeInput().strategy_context, tenant_id: "tenant-A" } }));

      integrations.resolveByChannel.mockResolvedValueOnce({
        publicConfig: { vapiPhoneNumberId: "phone-tenant-B" }
      });
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-B", status: "queued" },
      });
      await adapter.initiateCall(makeInput({ strategy_context: { ...makeInput().strategy_context, tenant_id: "tenant-B" } }));

      expect((mockedAxios.post as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toMatchObject({
        phoneNumberId: "phone-tenant-A",
      });
      expect((mockedAxios.post as ReturnType<typeof vi.fn>).mock.calls[1]![1]).toMatchObject({
        phoneNumberId: "phone-tenant-B",
      });
    });

    it("retorna status: failed sin lanzar excepcion cuando axios falla", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Network error"),
      );

      const result = await adapter.initiateCall(makeInput());

      expect(result).toEqual({ call_id: "", status: "failed" });
    });

    it("agrega + al numero de telefono cuando no lo tiene", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-001", status: "queued" },
      });

      await adapter.initiateCall(makeInput({ debtor_phone: "573001234567" }));

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          customer: expect.objectContaining({ number: "+573001234567" }),
        }),
        expect.anything(),
      );
    });

    it("no duplica el + si el numero ya lo tiene", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-002", status: "queued" },
      });

      await adapter.initiateCall(makeInput({ debtor_phone: "+573001234567" }));

      const callArgs = (mockedAxios.post as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect((callArgs[1] as { customer: { number: string } }).customer.number).toBe("+573001234567");
    });

    it("sin variables.empresa → variableValues.empresa usa EMPRESA_FALLBACK, no CobraAI (D-24)", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-003", status: "queued" },
      });

      await adapter.initiateCall(
        makeInput({
          strategy_context: {
            ...makeInput().strategy_context,
            variables: { nombre: "Juan Perez", monto: "150000", due_date: "2026-06-01" }
          }
        })
      );

      const callArgs = (mockedAxios.post as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const variableValues = (callArgs[1] as { assistantOverrides: { variableValues: Record<string, string> } })
        .assistantOverrides.variableValues;
      expect(variableValues.empresa).toBe(EMPRESA_FALLBACK);
    });

    it("propaga empresa_razon_social y empresa_nit a variableValues para identificación formal", async () => {
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-004", status: "queued" },
      });

      await adapter.initiateCall(
        makeInput({
          strategy_context: {
            ...makeInput().strategy_context,
            variables: {
              ...makeInput().strategy_context.variables,
              empresa: "Acme Cobranzas",
              empresa_razon_social: "Acme S.A.S.",
              empresa_nit: "900123456-7"
            }
          }
        })
      );

      const callArgs = (mockedAxios.post as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const variableValues = (callArgs[1] as { assistantOverrides: { variableValues: Record<string, string> } })
        .assistantOverrides.variableValues;
      expect(variableValues.empresa).toBe("Acme Cobranzas");
      expect(variableValues.empresa_razon_social).toBe("Acme S.A.S.");
      expect(variableValues.empresa_nit).toBe("900123456-7");
    });
  });

  describe("getCallStatus", () => {
    it("mapea status ended → completed", async () => {
      (mockedAxios.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-vapi-xyz", status: "ended" },
      });

      const result = await adapter.getCallStatus("call-vapi-xyz");

      expect(result).toEqual({ call_id: "call-vapi-xyz", status: "completed" });
    });

    it("mapea status in-progress → in_progress", async () => {
      (mockedAxios.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-001", status: "in-progress" },
      });

      const result = await adapter.getCallStatus("call-001");

      expect(result.status).toBe("in_progress");
    });

    it("mapea status ringing → ringing", async () => {
      (mockedAxios.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-001", status: "ringing" },
      });

      const result = await adapter.getCallStatus("call-001");

      expect(result.status).toBe("ringing");
    });

    it("retorna queued cuando axios falla en getCallStatus", async () => {
      (mockedAxios.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Network error"),
      );

      const result = await adapter.getCallStatus("call-xyz");

      expect(result).toEqual({ call_id: "call-xyz", status: "queued" });
    });

    it("llama a GET https://api.vapi.ai/call/:id con auth header", async () => {
      (mockedAxios.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { id: "call-abc", status: "queued" },
      });

      await adapter.getCallStatus("call-abc");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://api.vapi.ai/call/call-abc",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer vapi_test_key",
          }),
        }),
      );
    });
  });
});
