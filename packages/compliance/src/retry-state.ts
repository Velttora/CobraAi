import type { PrismaService } from "@cobrai/db";
import { resolveRetryPolicy } from "./country-rules";
import type { ContactCheckResult } from "./types";

/**
 * Estado del ciclo de reintento del deudor: en vez de contar envíos en una ventana
 * rodante, mira el intento de contacto más reciente y decide si toca esperar respuesta,
 * esperar el cooldown de reintento, o si el ciclo ya agotó sus intentos (estado terminal,
 * a resolver por el sweep de reintentos/escalamiento — ver ContactRetrySweepService).
 */
export async function computeRetryState(
  prisma: PrismaService,
  tenantId: string,
  debtorId: string,
  at: Date
): Promise<ContactCheckResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const policy = resolveRetryPolicy(tenant?.settings);

  const latest = await prisma.contact.findFirst({
    where: {
      tenantId,
      debtorId,
      deletedAt: null,
      // "failed" incluido: un envío fallido igual cuenta como intento en curso.
      // Si se omite, N deudas del mismo deudor cuyo 1er envío falla disparan N
      // contactos (la dedup del coordinator no lo ve) → sobre-contacto.
      status: { in: ["scheduled", "in_progress", "completed", "failed"] }
    },
    orderBy: { createdAt: "desc" },
    select: {
      responseStatus: true,
      startedAt: true,
      createdAt: true,
      nextRetryAt: true,
      attemptNumber: true
    }
  });

  if (!latest) return { allowed: true };

  if (latest.responseStatus === "pending") {
    const sentAt = latest.startedAt ?? latest.createdAt;
    const windowEnd = new Date(
      sentAt.getTime() + policy.windowHours * 60 * 60 * 1000
    );
    if (at < windowEnd) {
      return {
        allowed: false,
        reason: "awaiting_response",
        next_allowed_at: windowEnd
      };
    }
    // La ventana venció pero el sweep aún no lo marcó no_response — no bloquear
    // indefinidamente por un detalle de temporización del cron.
    return { allowed: true };
  }

  if (latest.responseStatus === "no_response") {
    if (latest.attemptNumber >= policy.maxAttempts) {
      return { allowed: false, reason: "max_attempts_reached" };
    }
    if (latest.nextRetryAt && at < latest.nextRetryAt) {
      return {
        allowed: false,
        reason: "retry_cooldown",
        next_allowed_at: latest.nextRetryAt
      };
    }
  }

  // responseStatus === "effective" → el ciclo se cerró con una conversación real;
  // un nuevo contacto empieza un ciclo fresco sin restricción.
  return { allowed: true };
}
