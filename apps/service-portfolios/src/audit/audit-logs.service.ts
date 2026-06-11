import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@cobrai/db";
import { describeAuditLog } from "@cobrai/utils";
import {
  lookupResourceName,
  resolveAuditResourceNames
} from "./audit-resource-resolver";

export type EnrichedAuditLog = {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName: string | null;
  changes: Prisma.JsonValue;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user: { id: string; name: string; email: string } | null;
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  assertAdmin(role?: string): void {
    if (role !== "admin") {
      throw new ForbiddenException("Solo administradores pueden acceder a auditoría");
    }
  }

  async list(tenantId: string, query: Record<string, unknown>) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.user_id ? { userId: String(query.user_id) } : {}),
      ...(query.action
        ? { action: { contains: String(query.action), mode: "insensitive" } }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(String(query.from)) } : {}),
              ...(query.to ? { lte: new Date(String(query.to)) } : {})
            }
          }
        : {})
    };

    const [rawItems, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true, email: true } } }
      }),
      this.prisma.auditLog.count({ where })
    ]);

    const nameMap = await resolveAuditResourceNames(
      this.prisma,
      tenantId,
      rawItems
    );

    const items: EnrichedAuditLog[] = rawItems.map((row) => ({
      ...row,
      resourceName:
        lookupResourceName(nameMap, row.resourceType, row.resourceId) ?? null
    }));

    return { items, total, page, limit };
  }

  async exportCsv(tenantId: string, query: Record<string, unknown>): Promise<string> {
    const { items } = await this.list(tenantId, { ...query, limit: 1000, page: 1 });
    const header =
      "fecha,usuario,accion,detalle,recurso,recurso_nombre,ip\n";
    const rows = items
      .map((row) => {
        const readable = describeAuditLog({
          action: row.action,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          resourceName: row.resourceName,
          changes:
            row.changes && typeof row.changes === "object"
              ? (row.changes as Record<string, unknown>)
              : {}
        });
        return [
          row.createdAt.toISOString(),
          row.user?.email ?? row.userId ?? "",
          readable.action,
          readable.detail ?? "",
          readable.resource,
          row.resourceName ?? "",
          row.ipAddress ?? ""
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",");
      })
      .join("\n");
    return header + rows;
  }
}
