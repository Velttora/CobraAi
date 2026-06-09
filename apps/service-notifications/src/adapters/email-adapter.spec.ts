import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { EmailAdapter } from "./email.adapter";

describe("EmailAdapter", () => {
  let adapter: EmailAdapter;

  beforeEach(() => {
    const config = {
      get: vi.fn((key: string) => {
        if (key === "SENDGRID_API_KEY") return undefined;
        if (key === "SENDGRID_FROM_EMAIL") return "noreply@test.com";
        return undefined;
      })
    };
    adapter = new EmailAdapter(config as unknown as ConfigService);
  });

  it("simula envío sin API key", async () => {
    const result = await adapter.sendTemplate({
      to: "test@example.com",
      template_id: "tpl-1",
      variables: { body: "Hola" },
      tenant_id: "t1"
    });
    expect(result.status).toBe("sent");
    expect(result.message_id).toBeTruthy();
  });

  describe("con SENDGRID_API_KEY presente", () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let adapterWithKey: EmailAdapter;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      vi.clearAllMocks();
      originalFetch = globalThis.fetch;

      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (_: string) => "msg-test" },
        text: async () => ""
      });
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const config = {
        get: vi.fn((key: string) => {
          if (key === "SENDGRID_API_KEY") return "SG.test";
          if (key === "SENDGRID_FROM_EMAIL") return "noreply@test.com";
          return undefined;
        })
      };
      adapterWithKey = new EmailAdapter(config as unknown as ConfigService);
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("con reply_to → el body del fetch incluye reply_to: { email }", async () => {
      await adapterWithKey.sendTemplate({
        to: "deudor@example.com",
        template_id: "tpl-1",
        variables: { body: "Hola" },
        tenant_id: "t1",
        reply_to: "reply@reply.fogging.org"
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const callInit = fetchMock.mock.calls[0][1] as RequestInit;
      const parsed = JSON.parse(callInit.body as string);
      expect(parsed.reply_to).toEqual({ email: "reply@reply.fogging.org" });
    });

    it("sin reply_to → el body del fetch NO contiene la clave reply_to", async () => {
      await adapterWithKey.sendTemplate({
        to: "deudor@example.com",
        template_id: "tpl-1",
        variables: { body: "Hola" },
        tenant_id: "t1"
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const callInit = fetchMock.mock.calls[0][1] as RequestInit;
      const parsed = JSON.parse(callInit.body as string);
      expect("reply_to" in parsed).toBe(false);
    });
  });
});
