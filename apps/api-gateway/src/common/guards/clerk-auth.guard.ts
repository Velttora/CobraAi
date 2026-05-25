import { verifyToken } from "@clerk/backend";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { parseWebOrigins } from "../cors-origins";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedRequest, ClerkJwtPayload } from "../types/clerk-request";
import { extractOrgId, extractOrgRole, normalizeClerkRole } from "../types/clerk-request";

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException("Token requerido");
    }

    const secretKey = this.config.get<string>("CLERK_SECRET_KEY");
    if (!secretKey) {
      throw new UnauthorizedException("CLERK_SECRET_KEY no configurada");
    }

    const authorizedParties = parseWebOrigins(
      this.config.get<string>("WEB_ORIGIN")
    );

    try {
      const payload = (await verifyToken(token, {
        secretKey,
        authorizedParties
      })) as ClerkJwtPayload;
      request.clerkUserId = payload.sub;
      request.clerkOrgId = extractOrgId(payload);
      request.clerkOrgRole = normalizeClerkRole(extractOrgRole(payload));
      request.clerkPayload = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Token inválido o expirado");
    }
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [type, token] = header.split(" ");
    return type === "Bearer" && token ? token : null;
  }
}
