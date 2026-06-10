import { All, Controller, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../common/types/clerk-request";

type ServiceRoute = {
  prefix: string;
  envKey: string;
};

const SERVICE_ROUTES: ServiceRoute[] = [
  { prefix: "/api/v1/portfolios", envKey: "SERVICE_PORTFOLIOS_URL" },
  { prefix: "/api/v1/debts", envKey: "SERVICE_PORTFOLIOS_URL" },
  { prefix: "/api/v1/debtors", envKey: "SERVICE_PORTFOLIOS_URL" },
  { prefix: "/api/v1/workflows", envKey: "SERVICE_WORKFLOWS_URL" },
  { prefix: "/api/v1/contacts", envKey: "SERVICE_NOTIFICATIONS_URL" },
  { prefix: "/api/v1/conversations", envKey: "SERVICE_NOTIFICATIONS_URL" },
  { prefix: "/api/v1/templates", envKey: "SERVICE_NOTIFICATIONS_URL" },
  { prefix: "/api/v1/payments", envKey: "SERVICE_PAYMENTS_URL" },
  { prefix: "/api/v1/payment-links", envKey: "SERVICE_PAYMENTS_URL" },
  { prefix: "/api/v1/integrations", envKey: "SERVICE_PORTFOLIOS_URL" },
  { prefix: "/api/v1/audit-logs", envKey: "SERVICE_PORTFOLIOS_URL" }
];

@Controller()
export class ProxyController {
  constructor(private readonly config: ConfigService) {}

  @All([
    "api/v1/portfolios",
    "api/v1/portfolios/*",
    "api/v1/debts",
    "api/v1/debts/*",
    "api/v1/debtors",
    "api/v1/debtors/*",
    "api/v1/workflows",
    "api/v1/workflows/*",
    "api/v1/contacts",
    "api/v1/contacts/*",
    "api/v1/conversations",
    "api/v1/conversations/*",
    "api/v1/templates",
    "api/v1/templates/*",
    "api/v1/payments",
    "api/v1/payments/*",
    "api/v1/payment-links",
    "api/v1/payment-links/*",
    "api/v1/integrations",
    "api/v1/integrations/*",
    "api/v1/audit-logs",
    "api/v1/audit-logs/*"
  ])
  async proxy(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ): Promise<void> {
    const path = req.url.split("?")[0] ?? "/";
    const route = SERVICE_ROUTES.find((r) => path.startsWith(r.prefix));

    if (!route) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Ruta no enrutada" }
      });
      return;
    }

    const baseUrl = this.config.get<string>(route.envKey);
    if (!baseUrl) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: `${route.envKey} no configurada`
        }
      });
      return;
    }

    const targetUrl = new URL(req.url, baseUrl.replace(/\/$/, ""));
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || key === "host" || key === "content-length") {
        continue;
      }
      if (Array.isArray(value)) {
        headers.set(key, value.join(","));
      } else {
        headers.set(key, value);
      }
    }

    const method = req.method.toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method);
    let body: string | undefined;
    if (hasBody && req.body !== undefined) {
      body =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }

    let upstreamRes: globalThis.Response;
    try {
      upstreamRes = await fetch(targetUrl, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(300_000)
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: `Servicio no disponible (${route.envKey})`,
          detail: (error as Error).message
        }
      });
      return;
    }

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, key) => {
      if (key !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    });

    const buffer = Buffer.from(await upstreamRes.arrayBuffer());
    res.send(buffer);
  }
}
