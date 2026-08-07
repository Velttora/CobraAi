import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EmailAdapter } from "./email.adapter";

function makeIntegrations(overrides: { resolveByChannel?: ReturnType<typeof vi.fn> } = {}) {
  return {
    resolveByChannel:
      overrides.resolveByChannel ??
      vi.fn().mockResolvedValue({
        secrets: { apiKey: "SG.test" },
        publicConfig: { fromEmail: "noreply@test.com", replyDomain: "reply.tenant.com" }
      })
  };
}

describe("EmailAdapter", () => {
  let integrations: ReturnType<typeof makeIntegrations>;
  let adapter: EmailAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.SIMULATE_OUTBOUND_SENDS;
    delete process.env.SIMULATE_OUTBOUND_SENDS;

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "msg-test" },
      text: async () => ""
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    integrations = makeIntegrations();
    adapter = new EmailAdapter(integrations as never, { get: () => "SG.parent_key" } as never);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.SIMULATE_OUTBOUND_SENDS;
    else process.env.SIMULATE_OUTBOUND_SENDS = originalEnv;
  });

  it("sin integración de SendGrid verificada y simulación apagada → status failed, no llama a fetch", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce(null);

    const result = await adapter.sendTemplate({
      to: "test@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ message_id: "", status: "failed" });
  });

  it("sin integración de SendGrid verificada y simulación encendida → sent simulado", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce(null);
    process.env.SIMULATE_OUTBOUND_SENDS = "true";

    const result = await adapter.sendTemplate({
      to: "test@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("sent");
    expect(result.simulated).toBe(true);
  });

  it("con integración verificada → llama a SendGrid con el apiKey y from del tenant", async () => {
    await adapter.sendTemplate({
      to: "deudor@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1"
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((callArgs[1].headers as Record<string, string>).Authorization).toBe("Bearer SG.test");
    const parsed = JSON.parse(callArgs[1].body as string);
    expect(parsed.from).toEqual({ email: "noreply@test.com" });
  });

  it("con publicConfig.fromName → incluye name en from", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce({
      secrets: { apiKey: "SG.test" },
      publicConfig: { fromEmail: "noreply@test.com", fromName: "Acme Cobranzas", replyDomain: "reply.tenant.com" }
    });

    await adapter.sendTemplate({
      to: "deudor@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1"
    });

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(callArgs[1].body as string);
    expect(parsed.from).toEqual({ email: "noreply@test.com", name: "Acme Cobranzas" });
  });

  it("con publicConfig.replyDomain del tenant → reply_to es reply@{replyDomain}, ya no el dominio fijo de la plataforma", async () => {
    await adapter.sendTemplate({
      to: "deudor@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1"
    });

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(callArgs[1].body as string);
    expect(parsed.reply_to).toEqual({ email: "reply@reply.tenant.com" });
  });

  it("sin publicConfig.replyDomain → el body del fetch NO contiene la clave reply_to (degradado a solo-salida, D-22)", async () => {
    integrations.resolveByChannel.mockResolvedValueOnce({
      secrets: { apiKey: "SG.test" },
      publicConfig: { fromEmail: "noreply@test.com" }
    });

    await adapter.sendTemplate({
      to: "deudor@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1"
    });

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(callArgs[1].body as string);
    expect("reply_to" in parsed).toBe(false);
  });

  it("input.reply_to explícito tiene precedencia sobre el replyDomain del tenant", async () => {
    await adapter.sendTemplate({
      to: "deudor@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1",
      reply_to: "explicit@override.com"
    });

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(callArgs[1].body as string);
    expect(parsed.reply_to).toEqual({ email: "explicit@override.com" });
  });

  it("SendGrid responde error → status failed", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" });

    const result = await adapter.sendTemplate({
      to: "deudor@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1"
    });

    expect(result.status).toBe("failed");
  });
});
