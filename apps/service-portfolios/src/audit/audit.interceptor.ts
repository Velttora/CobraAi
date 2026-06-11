import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditService } from "@cobrai/compliance";
import { PrismaService } from "@cobrai/db";
import { Observable, tap } from "rxjs";
import type { TenantContextRequest } from "@cobrai/utils";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SENSITIVE_GET = /^\/api\/v1\/debtors\/[^/]+$/;

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  private audit: AuditService;

  constructor(private readonly prisma: PrismaService) {
    this.audit = new AuditService(prisma);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<TenantContextRequest>();
    const method = req.method.toUpperCase();
    const path = req.path ?? req.url.split("?")[0] ?? "";

    if (!req.tenantId) {
      return next.handle();
    }

    if (method === "GET" && SENSITIVE_GET.test(path)) {
      return next.handle().pipe(
        tap(async () => {
          try {
            const debtorId = (req.params as { id?: string }).id;
            if (!debtorId) return;
            await this.audit.logSensitiveAccess({
              tenantId: req.tenantId!,
              userId: req.userId,
              resourceType: "debtor",
              resourceId: debtorId,
              action: "debtor.sensitive_read",
              ipAddress: req.ip,
              userAgent: String(req.headers["user-agent"] ?? "")
            });
          } catch (err) {
            // Auditoría best-effort: nunca debe tumbar el request ni el proceso.
            this.logger.warn(`Audit logSensitiveAccess falló: ${String(err)}`);
          }
        })
      );
    }

    if (!WRITE_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (body: unknown) => {
        try {
          const rawId =
            (body as { data?: { id?: string } })?.data?.id ??
            (req.params as { id?: string })?.id;
          const resourceId =
            typeof rawId === "string" && /^[0-9a-f-]{36}$/i.test(rawId)
              ? rawId
              : randomUUID();

          await this.audit.logAction({
            tenantId: req.tenantId!,
            userId: req.userId ?? null,
            action: `${method} ${path}`,
            resourceType: path.split("/")[3] ?? "unknown",
            resourceId,
            changes: {
              body: req.body as object,
              params: req.params as object
            },
            ipAddress: req.ip ?? null,
            userAgent: String(req.headers["user-agent"] ?? "")
          });
        } catch (err) {
          // Auditoría best-effort: nunca debe tumbar el request ni el proceso.
          this.logger.warn(`Audit logAction falló: ${String(err)}`);
        }
      })
    );
  }
}
