import { describe, expect, it, beforeEach, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import type { RequestContext } from "../common/decorators/request-context.decorator";
import { baseView } from "./integrations.fixtures";

function makeServiceMock() {
  return {
    list: vi.fn(),
    save: vi.fn(),
    disconnect: vi.fn(),
    verify: vi.fn(),
    embeddedSignup: vi.fn(),
    recheckEmailDns: vi.fn(),
    health: vi.fn(),
    uncontactedDebts: vi.fn()
  };
}

describe("IntegrationsController", () => {
  let controller: IntegrationsController;
  let serviceMock: ReturnType<typeof makeServiceMock>;
  const ctx: RequestContext = { tenantId: "tenant-1", userId: "user-1", userRole: "admin" };

  beforeEach(async () => {
    serviceMock = makeServiceMock();
    const moduleRef = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [{ provide: IntegrationsService, useValue: serviceMock }]
    }).compile();
    controller = moduleRef.get(IntegrationsController);
  });

  it("GET / returns successResponse({ items }) scoped to ctx.tenantId", async () => {
    serviceMock.list.mockResolvedValueOnce([baseView()]);

    const result = await controller.list(ctx);

    expect(serviceMock.list).toHaveBeenCalledWith("tenant-1");
    expect(result).toMatchObject({ success: true, data: { items: [expect.any(Object)] } });
  });

  it("PUT /:provider passes ctx.userRole into the service, so a non-admin gets 403 at the service layer", async () => {
    const viewerCtx: RequestContext = { ...ctx, userRole: "viewer" };
    serviceMock.save.mockResolvedValueOnce(baseView());

    await controller.save(viewerCtx, "stripe", { mode: "byo" });

    expect(serviceMock.save).toHaveBeenCalledWith("tenant-1", "stripe", { mode: "byo" }, "viewer");
  });

  it("DELETE /:provider disconnects and returns the updated view", async () => {
    serviceMock.disconnect.mockResolvedValueOnce(baseView({ status: "not_configured" }));

    const result = await controller.disconnect(ctx, "stripe");

    expect(serviceMock.disconnect).toHaveBeenCalledWith("tenant-1", "stripe", "admin");
    expect(result.data.status).toBe("not_configured");
  });

  it("POST /:provider/verify re-runs verification without a request body", async () => {
    serviceMock.verify.mockResolvedValueOnce(baseView({ status: "verified" }));

    await controller.verify(ctx, "stripe");

    expect(serviceMock.verify).toHaveBeenCalledWith("tenant-1", "stripe", "admin");
  });

  it("POST /whatsapp/embedded-signup accepts the Meta handoff DTO and returns the resulting view", async () => {
    const dto = { wabaId: "waba-1", phoneNumberId: "meta-1", phoneNumberE164: "+573001234567", businessName: "Acme" };
    serviceMock.embeddedSignup.mockResolvedValueOnce(baseView({ provider: "twilio_whatsapp" }));

    await controller.embeddedSignup(ctx, dto);

    expect(serviceMock.embeddedSignup).toHaveBeenCalledWith("tenant-1", dto, "admin");
  });

  it("POST /email/recheck-dns re-validates DNS and returns the updated view", async () => {
    serviceMock.recheckEmailDns.mockResolvedValueOnce(baseView({ provider: "sendgrid" }));

    await controller.recheckEmailDns(ctx);

    expect(serviceMock.recheckEmailDns).toHaveBeenCalledWith("tenant-1", "admin");
  });

  it("an unknown :provider surfaces the service's BadRequestException (400)", async () => {
    serviceMock.save.mockRejectedValueOnce(new BadRequestException("Proveedor de integración desconocido: bogus"));

    await expect(controller.save(ctx, "bogus", { mode: "byo" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("GET /health returns the summary shape from the service", async () => {
    serviceMock.health.mockResolvedValueOnce({ items: [], summary: { operational: 0, total: 10 } });

    const result = await controller.health(ctx);

    expect(result.data.summary).toEqual({ operational: 0, total: 10 });
  });

  it("GET /uncontacted-debts defaults page/pageSize and forwards them to the service", async () => {
    serviceMock.uncontactedDebts.mockResolvedValueOnce({ items: [], total: 0, page: 1 });

    await controller.uncontactedDebts(ctx, {});

    expect(serviceMock.uncontactedDebts).toHaveBeenCalledWith("tenant-1", 1, 25);
  });

  it("GET /uncontacted-debts forwards an explicit page/pageSize", async () => {
    serviceMock.uncontactedDebts.mockResolvedValueOnce({ items: [], total: 0, page: 2 });

    await controller.uncontactedDebts(ctx, { page: 2, pageSize: 10 });

    expect(serviceMock.uncontactedDebts).toHaveBeenCalledWith("tenant-1", 2, 10);
  });
});
