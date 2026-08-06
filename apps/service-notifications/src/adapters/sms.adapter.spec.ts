import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { SmsAdapter } from "./sms.adapter";

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = { ...overrides };
  return {
    get: vi.fn((key: string) => values[key])
  } as unknown as ConfigService;
}

describe("SmsAdapter", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.SIMULATE_OUTBOUND_SENDS;
    delete process.env.SIMULATE_OUTBOUND_SENDS;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.SIMULATE_OUTBOUND_SENDS;
    else process.env.SIMULATE_OUTBOUND_SENDS = originalEnv;
  });

  it("sin BIRD_API_KEY y simulación apagada → status failed", async () => {
    const adapter = new SmsAdapter(makeConfig());
    const result = await adapter.sendSMS({ to: "+573001234567", body: "hola", tenant_id: "t1" });
    expect(result).toEqual({ message_id: "", status: "failed" });
  });

  it("sin BIRD_API_KEY y simulación encendida → sent simulado", async () => {
    process.env.SIMULATE_OUTBOUND_SENDS = "true";
    const adapter = new SmsAdapter(makeConfig());
    const result = await adapter.sendSMS({ to: "+573001234567", body: "hola", tenant_id: "t1" });
    expect(result.status).toBe("sent");
    expect(result.simulated).toBe(true);
  });

  it("con BIRD_API_KEY → llama a Bird y retorna message_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
      json: async () => ({ id: "bird-1" })
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const adapter = new SmsAdapter(makeConfig({ BIRD_API_KEY: "bird-key" }));
    const result = await adapter.sendSMS({ to: "+573001234567", body: "hola", tenant_id: "t1" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ message_id: "bird-1", status: "sent" });
  });
});
