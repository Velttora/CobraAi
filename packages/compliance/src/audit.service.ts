import { PrismaService, type Prisma } from "@cobrai/db";
import { randomUUID } from "node:crypto";
import type { ContactCheckReason } from "./types";

export type ContactLifecycleAction =
  | "compliance.contact.sent"
  | "compliance.contact.send_failed"
  | "compliance.contact.effective"
  | "compliance.contact.no_response"
  | "compliance.contact.retry_scheduled"
  | "compliance.contact.escalated";

export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Traza descriptiva del ciclo de vida de un intento de contacto (envío → respuesta/vencimiento → reintento/escalamiento). */
  async logContactLifecycle(input: {
    tenantId: string;
    debtorId: string;
    action: ContactLifecycleAction;
    channel: string;
    attemptNumber: number;
    maxAttempts: number;
    windowHours?: number;
    respondedVia?: string;
    nextRetryAt?: Date;
    escalationTarget?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        action: input.action,
        resourceType: "debtor",
        resourceId: input.debtorId,
        changes: {
          channel: input.channel,
          attemptNumber: input.attemptNumber,
          maxAttempts: input.maxAttempts,
          windowHours: input.windowHours ?? null,
          respondedVia: input.respondedVia ?? null,
          nextRetryAt: input.nextRetryAt?.toISOString() ?? null,
          escalationTarget: input.escalationTarget ?? null
        }
      }
    });
  }

  async logComplianceDecision(input: {
    tenantId: string;
    debtorId: string;
    channel: string;
    allowed: boolean;
    reason?: ContactCheckReason;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        action: input.allowed ? "compliance.contact.allowed" : "compliance.contact.blocked",
        resourceType: "debtor",
        resourceId: input.debtorId,
        changes: {
          channel: input.channel,
          allowed: input.allowed,
          reason: input.reason ?? null
        },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  }

  async logSensitiveAccess(input: {
    tenantId: string;
    userId?: string;
    resourceType: string;
    resourceId: string;
    action: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        changes: {},
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  }

  async logAction(input: {
    tenantId: string;
    userId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string;
    changes?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const resourceId =
      input.resourceId && /^[0-9a-f-]{36}$/i.test(input.resourceId)
        ? input.resourceId
        : randomUUID();

    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId,
        changes: (input.changes ?? {}) as Prisma.InputJsonValue,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  }
}
