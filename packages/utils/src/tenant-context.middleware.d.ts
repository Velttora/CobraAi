import { type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
export interface TenantContextRequest extends Request {
    tenantId?: string;
    userId?: string;
    userRole?: string;
}
/**
 * Microservicios internos: leen headers inyectados por el API Gateway.
 */
export declare class TenantContextMiddleware implements NestMiddleware {
    use(req: TenantContextRequest, _res: Response, next: NextFunction): void;
}
//# sourceMappingURL=tenant-context.middleware.d.ts.map