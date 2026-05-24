import {
  ForbiddenException,
  Injectable,
  type NestMiddleware
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export interface TenantContextRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
}

/**
 * Microservicios internos: leen headers inyectados por el API Gateway.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: TenantContextRequest, _res: Response, next: NextFunction): void {
    const tenantId = req.headers["x-tenant-id"];
    const userId = req.headers["x-user-id"];
    const userRole = req.headers["x-user-role"];

    const tenantIdValue = Array.isArray(tenantId) ? tenantId[0] : tenantId;

    if (!tenantIdValue || typeof tenantIdValue !== "string") {
      throw new ForbiddenException("X-Tenant-Id requerido");
    }

    req.tenantId = tenantIdValue;
    req.userId = Array.isArray(userId) ? userId[0] : (userId as string | undefined);
    req.userRole = Array.isArray(userRole)
      ? userRole[0]
      : (userRole as string | undefined);

    next();
  }
}
