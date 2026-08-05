import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { ProxyController } from "./proxy.controller";
import type { AuthenticatedRequest } from "../common/types/clerk-request";

function makeReq(url: string, overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    url,
    method: "GET",
    headers: { "x-tenant-id": "tenant-1" },
    body: undefined,
    ...overrides
  } as unknown as AuthenticatedRequest;
}

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    send: vi.fn()
  } as unknown as Response;
}

describe("ProxyController — route table", () => {
  let controller: ProxyController;
  const config = { get: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ProxyController(config as never);
  });

  it("resolves /api/v1/integrations to SERVICE_NOTIFICATIONS_URL", async () => {
    config.get.mockImplementation((key: string) =>
      key === "SERVICE_NOTIFICATIONS_URL" ? "http://notifications.internal" : undefined
    );
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0)
    });
    vi.stubGlobal("fetch", fetchMock);

    await controller.proxy(makeReq("/api/v1/integrations"), makeRes());

    expect(config.get).toHaveBeenCalledWith("SERVICE_NOTIFICATIONS_URL");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: "http://notifications.internal/api/v1/integrations" }),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it("resolves a nested /api/v1/integrations/:provider/verify path to the same route", async () => {
    config.get.mockImplementation((key: string) =>
      key === "SERVICE_NOTIFICATIONS_URL" ? "http://notifications.internal" : undefined
    );
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0)
    });
    vi.stubGlobal("fetch", fetchMock);

    await controller.proxy(makeReq("/api/v1/integrations/stripe/verify", { method: "POST" }), makeRes());

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: "http://notifications.internal/api/v1/integrations/stripe/verify" }),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it("returns 503 with SERVICE_NOTIFICATIONS_URL named when the env var is missing", async () => {
    config.get.mockReturnValue(undefined);
    const res = makeRes();

    await controller.proxy(makeReq("/api/v1/integrations"), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: "SERVICE_NOTIFICATIONS_URL no configurada" })
      })
    );
  });

  it("returns 404 for a path with no matching route prefix", async () => {
    const res = makeRes();

    await controller.proxy(makeReq("/api/v1/unrouted"), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
