import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedRequest } from "../types/clerk-request";
import { ensureTenantRecord, PrismaService } from "@cobrai/db";
import { RateLimitService } from "../../rate-limit/rate-limit.service";

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Promise<Observable<unknown>> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.clerkOrgId;

    if (!tenantId) {
      throw new ForbiddenException(
        "El usuario no pertenece a ninguna organización. Completa el onboarding en /onboarding."
      );
    }

    request.headers["x-tenant-id"] = tenantId;
    request.headers["x-user-id"] = request.clerkUserId ?? "";
    request.headers["x-user-role"] = request.clerkOrgRole ?? "viewer";

    try {
      await ensureTenantRecord(this.prisma, tenantId);
    } catch (error) {
      throw new HttpException(
        "No se pudo sincronizar la organización en la base de datos",
        HttpStatus.SERVICE_UNAVAILABLE,
        { cause: error }
      );
    }

    const tenantLimit = Number(
      this.config.get<string>("RATE_LIMIT_TENANT_PER_MIN") ?? 1000
    );
    const tenantOk = await this.rateLimit.checkLimit(
      `tenant:${tenantId}`,
      tenantLimit
    );
    if (!tenantOk) {
      throw new HttpException(
        "Rate limit excedido por tenant",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return next.handle();
  }
}
