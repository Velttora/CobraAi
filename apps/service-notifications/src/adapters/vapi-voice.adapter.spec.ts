import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";

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
  let adapter: VapiVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new VapiVoiceAdapter(makeConfig());
  });

  it("sin credenciales Vapi → modo sandbox sin llamar a la API", async () => {
    const sandbox = new VapiVoiceAdapter({
      get: () => undefined,
      getOrThrow: vi.fn()
    } as unknown as ConfigService);
    const result = await sandbox.initiateCall(makeInput());
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(result.status).toBe("queued");
    expect(result.call_id).toMatch(/^sandbox-/);
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
