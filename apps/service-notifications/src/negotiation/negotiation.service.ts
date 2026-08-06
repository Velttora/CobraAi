import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService, type ContactChannel } from "@cobrai/db";
import { parseMessagePayload } from "../common/utils/api.utils";
import {
  PaymentPlanService,
  type PlanInstallmentInput
} from "../agent/payment-plan.service";
import {
  daysOverdue,
  derivePlanState,
  derivePromiseState,
  sourceForFilter,
  statesForFilter,
  summarizePlanProgress,
  toEngineStatus,
  type CommitmentSource,
  type CommitmentState,
  type EngineStatus
} from "./commitment-status";

/**
 * Bandeja de promesas y acuerdos de pago.
 *
 * Proyecta `PromiseToPay` y `PaymentPlan` — lo que ya se pactó con el deudor,
 * por cualquier canal — a un shape único de "compromiso". Es solo lectura: aquí
 * nadie aprueba ni cierra nada, únicamente se responde qué pasó con cada deuda.
 *
 * NOTA DE FUSIÓN: la rama `feat/negotiation-engine` trae un servicio con este
 * mismo nombre y ruta (`v1/negotiations`) que además maneja negociaciones del
 * motor LLM y proyecta estos mismos compromisos directos. Al fusionar, ese
 * archivo reemplaza a este; lo que vale la pena rescatar de aquí son los campos
 * de detalle (vencimiento, avance del plan, conversación), que allá no existen.
 */

/** Tope de filas leídas por tabla antes de filtrar en memoria. */
const MAX_SCAN = 500;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const PREVIEW_CHARS = 160;

/** Qué se está pidiendo aprobar. */
export type ApprovalKind = "payment_plan" | "settlement_remainder";

interface ApprovalRequestEntry {
  decision: string;
  kind?: ApprovalKind;
  notes?: string | null;
  installments?: {
    installment_number: number;
    amount: number;
    due_date: string;
  }[];
}

export interface CommitmentFilters {
  status?: string;
  type?: string;
  portfolioId?: string;
  debtId?: string;
  debtorId?: string;
  search?: string;
  limit?: number;
}

export interface CommitmentConversation {
  id: string;
  channel: string | null;
  last_message_at: string | null;
  /** `in` = lo dijo el deudor, `out` = se lo dijimos nosotros. */
  last_message_direction: "in" | "out" | null;
  last_message_preview: string | null;
}

export interface CommitmentItem {
  /** `promise:<uuid>` o `plan:<uuid>`: el id no es único entre las dos tablas. */
  id: string;
  source: CommitmentSource;
  /** Vocabulario del motor de negociación, por compatibilidad de shape. */
  status: EngineStatus;
  /** Estado real, ya cruzado contra el calendario. Es el que usa la UI. */
  commitment_state: CommitmentState;

  debt_id: string;
  debtor_id: string;
  debtor_name: string | null;
  debt_external_ref: string | null;
  debt_amount_outstanding: number | null;
  debt_due_date: string | null;
  aging_bucket: string | null;
  currency: string;
  ai_segment: string | null;
  portfolio_id: string | null;
  portfolio_name: string | null;

  /** Lo pactado. En un plan es el total, no la cuota. */
  offer_settlement_amount: number;
  offer_installments: number;
  amount_paid: number;
  installments_paid: number;
  /** Próxima fecha pactada sin cumplir; en una promesa simple, su fecha. */
  due_date: string | null;
  /** Días vencidos sobre `due_date`. Negativo = todavía no vence. */
  days_overdue: number | null;
  channel: string | null;
  notes: string | null;
  /** Qué hay que aprobar; null cuando el compromiso ya está vigente. */
  approval_kind?: ApprovalKind | null;
  /** Descuento que implica el acuerdo propuesto, sobre el saldo actual. */
  discount_pct?: number | null;

  conversation: CommitmentConversation | null;
  /** Duplicado plano: la card enlaza al hilo sin desempacar el objeto. */
  conversation_id: string | null;

  agreed_at: string;
  updated_at: string;
  plan_id: string | null;
  /** No hay bitácora de rondas sin motor de negociación. */
  has_detail: false;
}

export interface CommitmentSummary {
  total: number;
  /** Acuerdos propuestos que esperan que una persona decida. */
  awaiting_approval: number;
  awaiting_approval_amount: number;
  pending: number;
  overdue: number;
  kept: number;
  broken: number;
  cancelled: number;
  committed_amount: number;
  paid_amount: number;
  pending_amount: number;
  overdue_amount: number;
  /**
   * Cumplimiento sobre lo que ya se puede juzgar: un compromiso que aún no
   * vence no dice nada del deudor, así que no entra al denominador.
   */
  keep_rate: number | null;
  currency: string;
}

const DEBT_SELECT = {
  id: true,
  debtorId: true,
  externalRef: true,
  amountOutstanding: true,
  currency: true,
  aiSegment: true,
  agingBucket: true,
  dueDate: true,
  portfolioId: true,
  portfolio: { select: { id: true, name: true } },
  debtor: { select: { id: true, name: true } }
} as const;

@Injectable()
export class NegotiationService {
  private readonly logger = new Logger(NegotiationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentPlans: PaymentPlanService
  ) {}

  // ─── Aprobación humana ────────────────────────────────────────────────────

  /**
   * Deja un acuerdo propuesto esperando decisión, sin materializar nada.
   *
   * Ningún acuerdo se cierra solo: el agente propone y una persona aprueba. Por
   * eso acá no se crea el plan ni se mueve el saldo — solo se guarda lo que se
   * va a ejecutar si alguien dice que sí.
   *
   * Devuelve el id de la solicitud, o null si la propuesta no forma un acuerdo
   * (un plan necesita al menos 2 cuotas; con una sola es una promesa simple).
   */
  async requestApproval(input: {
    tenantId: string;
    debtId: string;
    kind: ApprovalKind;
    installments?: PlanInstallmentInput[];
    /** Monto a condonar, solo para `settlement_remainder`. */
    settlementAmount?: number;
    conversationId?: string | null;
    channel?: ContactChannel | null;
    planId?: string | null;
    notes?: string;
  }): Promise<string | null> {
    const installments = (input.installments ?? [])
      .filter((i) => i.amount > 0 && Boolean(i.dueDate))
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    if (input.kind === "payment_plan" && installments.length < 2) {
      return null;
    }

    const debt = await this.prisma.debt.findFirst({
      where: { id: input.debtId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true, debtorId: true, amountOutstanding: true }
    });
    if (!debt) return null;

    const outstanding = Number(debt.amountOutstanding);
    const amount =
      input.kind === "payment_plan"
        ? installments.reduce((sum, i) => sum + i.amount, 0)
        : Math.max(0, input.settlementAmount ?? 0);
    if (amount <= 0) return null;

    const entry = {
      at: new Date().toISOString(),
      decision: "approval_requested",
      kind: input.kind,
      // Se guarda el calendario completo: al aprobar se ejecuta exactamente lo
      // que se le mostró a quien aprobó, no una recalculación posterior.
      installments: installments.map((i) => ({
        installment_number: i.installmentNumber,
        amount: i.amount,
        due_date: i.dueDate
      })),
      notes: input.notes ?? null,
      reasons: ["requiere_aprobacion_humana"]
    };

    const data = {
      status: "escalated" as const,
      channel: input.channel ?? null,
      conversationId: input.conversationId ?? null,
      originalAmount: outstanding,
      offerSettlementAmount: amount,
      offerInstallments:
        input.kind === "payment_plan" ? installments.length : 1,
      offerDiscountPct:
        outstanding > 0 && input.kind === "payment_plan"
          ? Math.max(0, Math.round(((outstanding - amount) / outstanding) * 100))
          : null,
      planId: input.planId ?? null
    };

    // Una propuesta nueva sobre la misma deuda reemplaza a la que seguía
    // esperando: dos solicitudes vivas para lo mismo obligan a adivinar cuál
    // está vigente.
    const open = await this.prisma.negotiation.findFirst({
      where: {
        tenantId: input.tenantId,
        debtId: input.debtId,
        status: "escalated",
        deletedAt: null
      },
      orderBy: { updatedAt: "desc" }
    });

    if (open) {
      const history = Array.isArray(open.history) ? [...open.history] : [];
      history.push(entry);
      await this.prisma.negotiation.update({
        where: { id: open.id },
        data: { ...data, history: history as never }
      });
      return open.id;
    }

    const created = await this.prisma.negotiation.create({
      data: {
        tenantId: input.tenantId,
        debtId: debt.id,
        debtorId: debt.debtorId,
        round: 0,
        ...data,
        history: [entry] as never
      }
    });

    this.logger.log(
      `Acuerdo esperando aprobación negociación=${created.id} deuda=${input.debtId} ` +
        `tipo=${input.kind} monto=${amount}`
    );
    return created.id;
  }

  /**
   * Un humano aprueba: recién acá el acuerdo existe de verdad.
   *
   * Se ejecuta con los términos exactos que quedaron guardados, sin recalcular:
   * lo que se aprueba tiene que ser lo mismo que se mostró.
   */
  async approve(
    tenantId: string,
    id: string,
    approvedBy?: string
  ): Promise<{ negotiation_id: string; plan_id: string | null; status: string }> {
    const negotiation = await this.findPending(tenantId, id);
    const request = this.lastRequest(negotiation.history);
    const kind: ApprovalKind =
      request?.kind === "settlement_remainder"
        ? "settlement_remainder"
        : "payment_plan";

    let planId: string | null = negotiation.planId;

    if (kind === "payment_plan") {
      planId = await this.paymentPlans.createPlan(tenantId, {
        debtId: negotiation.debtId,
        installments: (request?.installments ?? []).map((i) => ({
          installmentNumber: i.installment_number,
          amount: i.amount,
          dueDate: i.due_date
        })),
        createdVia: negotiation.channel ?? undefined,
        notes: request?.notes ?? undefined
      });
    } else {
      await this.forgiveRemainder(tenantId, negotiation.debtId, {
        amount: Number(negotiation.offerSettlementAmount ?? 0),
        planId: negotiation.planId,
        approvedBy
      });
    }

    await this.closeNegotiation(negotiation.id, negotiation.history, {
      status: "agreed",
      planId,
      entry: {
        at: new Date().toISOString(),
        decision: "approved",
        kind,
        approved_by: approvedBy ?? null
      }
    });

    this.logger.log(
      `Acuerdo aprobado negociación=${id} deuda=${negotiation.debtId} ` +
        `tipo=${kind} plan=${planId ?? "—"} por=${approvedBy ?? "—"}`
    );
    return { negotiation_id: id, plan_id: planId, status: "agreed" };
  }

  /** Un humano rechaza: no se materializa nada y la deuda vuelve a gestión. */
  async reject(
    tenantId: string,
    id: string,
    input: { reason?: string; rejectedBy?: string } = {}
  ): Promise<{ negotiation_id: string; status: string }> {
    const negotiation = await this.findPending(tenantId, id);
    const request = this.lastRequest(negotiation.history);

    if (request?.kind === "settlement_remainder") {
      // El remanente vuelve a ser deuda cobrable: el acuerdo cumplido no
      // alcanzó para cerrarla y nadie autorizó perdonar lo que falta.
      await this.prisma.debt.updateMany({
        where: { id: negotiation.debtId, tenantId },
        data: { status: "active" }
      });
    }

    await this.closeNegotiation(negotiation.id, negotiation.history, {
      status: "rejected",
      planId: negotiation.planId,
      entry: {
        at: new Date().toISOString(),
        decision: "rejected",
        kind: request?.kind ?? "payment_plan",
        rejected_by: input.rejectedBy ?? null,
        reason: input.reason ?? null
      }
    });

    this.logger.log(
      `Acuerdo rechazado negociación=${id} deuda=${negotiation.debtId} ` +
        `por=${input.rejectedBy ?? "—"}`
    );
    return { negotiation_id: id, status: "rejected" };
  }

  private async findPending(tenantId: string, id: string) {
    const row = await this.prisma.negotiation.findFirst({
      where: { id, tenantId, deletedAt: null }
    });
    if (!row) {
      throw new NotFoundException("Acuerdo no encontrado");
    }
    if (row.status !== "escalated") {
      throw new NotFoundException("Este acuerdo ya fue resuelto");
    }
    return row;
  }

  private lastRequest(history: unknown): ApprovalRequestEntry | null {
    const entries = Array.isArray(history) ? history : [];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i] as ApprovalRequestEntry | null;
      if (entry?.decision === "approval_requested") return entry;
    }
    return null;
  }

  private async closeNegotiation(
    id: string,
    history: unknown,
    input: {
      status: "agreed" | "rejected";
      planId: string | null;
      entry: Record<string, unknown>;
    }
  ): Promise<void> {
    const entries = Array.isArray(history) ? [...history] : [];
    entries.push(input.entry);
    await this.prisma.negotiation.update({
      where: { id },
      data: {
        status: input.status,
        planId: input.planId,
        agreedAt: input.status === "agreed" ? new Date() : null,
        history: entries as never
      }
    });
  }

  /** Condonar mueve plata: solo ocurre con un humano detrás y queda firmado. */
  private async forgiveRemainder(
    tenantId: string,
    debtId: string,
    input: { amount: number; planId: string | null; approvedBy?: string }
  ): Promise<void> {
    await this.prisma.debt.updateMany({
      where: { id: debtId, tenantId },
      data: { amountOutstanding: 0, status: "paid_full" }
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: input.approvedBy ?? null,
        action: "debt.balance_forgiven",
        resourceType: "debt",
        resourceId: debtId,
        changes: {
          forgiven_amount: input.amount,
          plan_id: input.planId,
          approved_by: input.approvedBy ?? null,
          reason: "settlement_approved"
        }
      }
    });
  }

  /** Compromisos del tenant, ya filtrados y ordenados para la bandeja. */
  async list(
    tenantId: string,
    filters: CommitmentFilters = {}
  ): Promise<CommitmentItem[]> {
    const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const states = statesForFilter(filters.status);
    const items = await this.collect(tenantId, filters);

    const filtered = states
      ? items.filter((i) => states.includes(i.commitment_state))
      : items;

    return filtered.sort(compareByUrgency).slice(0, limit);
  }

  /**
   * Totales del mismo universo que la bandeja, ignorando el filtro de estado:
   * el encabezado tiene que responder "de todo lo pactado, cuánto se cumplió",
   * no "cuánto se cumplió de lo que estoy mirando ahora".
   */
  async summary(
    tenantId: string,
    filters: CommitmentFilters = {}
  ): Promise<CommitmentSummary> {
    const items = await this.collect(tenantId, { ...filters, status: undefined });

    const count = (state: CommitmentState): number =>
      items.filter((i) => i.commitment_state === state).length;
    const amount = (state: CommitmentState): number =>
      items
        .filter((i) => i.commitment_state === state)
        .reduce((sum, i) => sum + i.offer_settlement_amount, 0);

    const kept = count("kept");
    const broken = count("broken");
    const overdue = count("overdue");
    const judged = kept + broken + overdue;

    return {
      total: items.length,
      awaiting_approval: count("awaiting_approval"),
      awaiting_approval_amount: amount("awaiting_approval"),
      pending: count("pending"),
      overdue,
      kept,
      broken,
      cancelled: count("cancelled"),
      committed_amount: items.reduce(
        (sum, i) => sum + i.offer_settlement_amount,
        0
      ),
      paid_amount: items.reduce((sum, i) => sum + i.amount_paid, 0),
      pending_amount: amount("pending"),
      overdue_amount: amount("overdue"),
      keep_rate: judged === 0 ? null : Math.round((kept / judged) * 100),
      // Las carteras son de una sola moneda en la práctica; si llegara a haber
      // mezcla, el encabezado se queda con la del primer compromiso.
      currency: items[0]?.currency ?? "COP"
    };
  }

  // ─── Proyección ───────────────────────────────────────────────────────────

  private async collect(
    tenantId: string,
    filters: CommitmentFilters
  ): Promise<CommitmentItem[]> {
    const sources = sourceForFilter(filters.type);
    const now = new Date();
    const debtWhere = this.debtWhere(filters);

    const [plans, promises] = await Promise.all([
      sources.includes("direct_plan")
        ? this.prisma.paymentPlan.findMany({
            where: {
              tenantId,
              deletedAt: null,
              ...(filters.debtId ? { debtId: filters.debtId } : {}),
              ...(Object.keys(debtWhere).length > 0 ? { debt: debtWhere } : {})
            },
            orderBy: { updatedAt: "desc" },
            take: MAX_SCAN,
            include: {
              debt: { select: DEBT_SELECT },
              installments: {
                where: { deletedAt: null },
                select: {
                  status: true,
                  amount: true,
                  amountPaid: true,
                  promisedDate: true,
                  installmentNumber: true
                }
              }
            }
          })
        : Promise.resolve([]),
      sources.includes("direct_promise")
        ? this.prisma.promiseToPay.findMany({
            where: {
              tenantId,
              deletedAt: null,
              // Las cuotas de un plan se muestran dentro del plan, no sueltas.
              planId: null,
              ...(filters.debtId ? { debtId: filters.debtId } : {}),
              ...(Object.keys(debtWhere).length > 0 ? { debt: debtWhere } : {})
            },
            orderBy: { updatedAt: "desc" },
            take: MAX_SCAN,
            include: {
              debt: { select: DEBT_SELECT },
              contact: { select: { channel: true } }
            }
          })
        : Promise.resolve([])
    ]);

    const items: CommitmentItem[] = [
      ...(await this.listPendingApprovals(tenantId, filters)),
      ...plans.map((plan) => this.planToItem(plan, now)),
      ...promises.map((promise) => this.promiseToItem(promise, now))
    ];

    await this.attachConversations(tenantId, items);
    return items;
  }

  /**
   * Acuerdos propuestos que esperan decisión humana. Van primero en la bandeja
   * porque son lo único que no avanza solo: hasta que alguien decida, el deudor
   * quedó con una respuesta pendiente.
   */
  private async listPendingApprovals(
    tenantId: string,
    filters: CommitmentFilters
  ): Promise<CommitmentItem[]> {
    const debtWhere = this.debtWhere(filters);
    const rows = await this.prisma.negotiation.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "escalated",
        ...(filters.debtId ? { debtId: filters.debtId } : {}),
        ...(Object.keys(debtWhere).length > 0 ? { debt: debtWhere } : {})
      },
      orderBy: { updatedAt: "asc" },
      take: MAX_SCAN,
      include: { debt: { select: DEBT_SELECT } }
    });

    return rows.map((row) => {
      const request = this.lastRequest(row.history);
      const firstDue = request?.installments?.[0]?.due_date ?? null;
      const isSettlement = request?.kind === "settlement_remainder";

      return {
        id: row.id,
        source: "direct_plan" as const,
        status: "escalated" as const,
        commitment_state: "awaiting_approval" as const,
        ...this.debtFields(row.debt),
        offer_settlement_amount: Number(row.offerSettlementAmount ?? 0),
        offer_installments: row.offerInstallments ?? 1,
        amount_paid: 0,
        installments_paid: 0,
        due_date: firstDue ? new Date(firstDue).toISOString() : null,
        days_overdue: null,
        channel: row.channel ?? null,
        notes: isSettlement
          ? "El deudor cumplió el acuerdo y queda un remanente por definir."
          : request?.notes ?? null,
        approval_kind: isSettlement
          ? ("settlement_remainder" as const)
          : ("payment_plan" as const),
        discount_pct:
          row.offerDiscountPct === null ? null : Number(row.offerDiscountPct),
        conversation: null,
        conversation_id: null,
        agreed_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
        plan_id: row.planId,
        has_detail: false as const
      };
    });
  }

  /** Filtro sobre la deuda: portafolio, deudor y búsqueda por cuenta o nombre. */
  private debtWhere(filters: CommitmentFilters): Record<string, unknown> {
    const search = filters.search?.trim();
    return {
      deletedAt: null,
      ...(filters.portfolioId ? { portfolioId: filters.portfolioId } : {}),
      ...(filters.debtorId ? { debtorId: filters.debtorId } : {}),
      ...(search
        ? {
            OR: [
              { externalRef: { contains: search, mode: "insensitive" } },
              { debtor: { name: { contains: search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
  }

  private planToItem(
    plan: {
      id: string;
      debtId: string;
      totalAmount: unknown;
      installmentsCount: number;
      status: string;
      createdVia: string | null;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
      debt: DebtProjection;
      installments: {
        status: string;
        amount: unknown;
        amountPaid: unknown;
        promisedDate: Date | null;
      }[];
    },
    now: Date
  ): CommitmentItem {
    const installments = plan.installments.map((i) => ({
      status: i.status,
      promisedDate: i.promisedDate,
      amount: Number(i.amount),
      amountPaid: Number(i.amountPaid ?? 0)
    }));
    const state = derivePlanState(plan.status, installments, now);
    const progress = summarizePlanProgress(installments, now);
    // En mora manda la cuota vencida más vieja: es la que mide el daño real,
    // no la siguiente por vencer.
    const dueDate = progress.oldestOverdueDate ?? progress.nextDueDate;

    return {
      id: `plan:${plan.id}`,
      source: "direct_plan",
      status: toEngineStatus(state),
      commitment_state: state,
      ...this.debtFields(plan.debt),
      offer_settlement_amount: Number(plan.totalAmount),
      offer_installments: plan.installmentsCount,
      amount_paid: progress.amountPaid,
      installments_paid: progress.installmentsPaid,
      due_date: dueDate ? dueDate.toISOString() : null,
      days_overdue: dueDate ? daysOverdue(dueDate, now) : null,
      channel: plan.createdVia ?? null,
      notes: plan.notes ?? null,
      conversation: null,
      conversation_id: null,
      agreed_at: plan.createdAt.toISOString(),
      updated_at: plan.updatedAt.toISOString(),
      plan_id: plan.id,
      has_detail: false
    };
  }

  private promiseToItem(
    promise: {
      id: string;
      debtId: string;
      amount: unknown;
      amountPaid: unknown;
      promisedDate: Date;
      status: string;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
      debt: DebtProjection;
      contact: { channel: string } | null;
    },
    now: Date
  ): CommitmentItem {
    const state = derivePromiseState(promise.status, promise.promisedDate, now);

    return {
      id: `promise:${promise.id}`,
      source: "direct_promise",
      status: toEngineStatus(state),
      commitment_state: state,
      ...this.debtFields(promise.debt),
      offer_settlement_amount: Number(promise.amount),
      offer_installments: 1,
      amount_paid: Number(promise.amountPaid ?? 0),
      installments_paid: promise.status === "kept" ? 1 : 0,
      due_date: promise.promisedDate.toISOString(),
      days_overdue: daysOverdue(promise.promisedDate, now),
      // El canal sale del contacto que la generó: es cómo se pactó.
      channel: promise.contact?.channel ?? null,
      notes: promise.notes ?? null,
      conversation: null,
      conversation_id: null,
      agreed_at: promise.createdAt.toISOString(),
      updated_at: promise.updatedAt.toISOString(),
      plan_id: null,
      has_detail: false
    };
  }

  private debtFields(debt: DebtProjection) {
    return {
      debt_id: debt.id,
      debtor_id: debt.debtorId,
      debtor_name: debt.debtor?.name ?? null,
      debt_external_ref: debt.externalRef ?? null,
      debt_amount_outstanding:
        debt.amountOutstanding === null ? null : Number(debt.amountOutstanding),
      debt_due_date: debt.dueDate ? debt.dueDate.toISOString() : null,
      aging_bucket: debt.agingBucket ?? null,
      currency: debt.currency ?? "COP",
      ai_segment: debt.aiSegment ?? null,
      portfolio_id: debt.portfolioId ?? null,
      portfolio_name: debt.portfolio?.name ?? null
    };
  }

  /**
   * Cuelga a cada compromiso el hilo donde se pactó. Un acuerdo sin el "qué se
   * dijo" obliga a ir a buscarlo a otra pantalla, que es donde el seguimiento
   * se abandona.
   *
   * `PromiseToPay` no guarda conversación, así que se resuelve por deuda y, si
   * el hilo era del deudor sin deuda puntual, por deudor.
   */
  private async attachConversations(
    tenantId: string,
    items: CommitmentItem[]
  ): Promise<void> {
    if (items.length === 0) return;

    const debtIds = [...new Set(items.map((i) => i.debt_id))];
    const debtorIds = [...new Set(items.map((i) => i.debtor_id))];

    const conversations = await this.prisma.conversation.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ debtId: { in: debtIds } }, { debtorId: { in: debtorIds } }]
      },
      orderBy: [
        { lastMessageAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" }
      ],
      take: MAX_SCAN * 2,
      select: {
        id: true,
        debtId: true,
        debtorId: true,
        channel: true,
        lastMessageAt: true,
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { direction: true, content: true }
        }
      }
    });

    // Vienen ordenadas por recencia: la primera que aparece para una deuda o un
    // deudor es la vigente, y las siguientes no la desplazan.
    const byDebt = new Map<string, CommitmentConversation>();
    const byDebtor = new Map<string, CommitmentConversation>();

    for (const conv of conversations) {
      const projected = this.toConversation(conv);
      if (conv.debtId && !byDebt.has(conv.debtId)) {
        byDebt.set(conv.debtId, projected);
      }
      if (!byDebtor.has(conv.debtorId)) {
        byDebtor.set(conv.debtorId, projected);
      }
    }

    for (const item of items) {
      const conv = byDebt.get(item.debt_id) ?? byDebtor.get(item.debtor_id) ?? null;
      item.conversation = conv;
      item.conversation_id = conv?.id ?? null;
    }
  }

  private toConversation(conv: {
    id: string;
    channel: string | null;
    lastMessageAt: Date | null;
    messages: { direction: string; content: string }[];
  }): CommitmentConversation {
    const last = conv.messages[0];
    const preview = last ? parseMessagePayload(last.content).text : null;

    return {
      id: conv.id,
      channel: conv.channel ?? null,
      last_message_at: conv.lastMessageAt
        ? conv.lastMessageAt.toISOString()
        : null,
      last_message_direction: last ? (last.direction as "in" | "out") : null,
      last_message_preview: preview ? truncate(preview, PREVIEW_CHARS) : null
    };
  }
}

interface DebtProjection {
  id: string;
  debtorId: string;
  externalRef: string | null;
  amountOutstanding: unknown;
  currency: string | null;
  aiSegment: string | null;
  agingBucket: string | null;
  dueDate: Date | null;
  portfolioId: string | null;
  portfolio: { id: string; name: string } | null;
  debtor: { id: string; name: string } | null;
}

const STATE_PRIORITY: Record<CommitmentState, number> = {
  // Lo que espera una decisión va primero: es lo único que no avanza solo.
  awaiting_approval: -1,
  overdue: 0,
  pending: 1,
  broken: 2,
  kept: 3,
  cancelled: 4
};

/**
 * Lo que exige acción arriba: primero lo vencido (y dentro de eso, lo que más
 * lleva vencido), después lo vigente por fecha de vencimiento, y al final lo
 * ya resuelto por recencia. Una bandeja ordenada solo por fecha de creación
 * entierra la mora bajo los acuerdos de ayer.
 */
export function compareByUrgency(a: CommitmentItem, b: CommitmentItem): number {
  const byState =
    STATE_PRIORITY[a.commitment_state] - STATE_PRIORITY[b.commitment_state];
  if (byState !== 0) return byState;

  if (
    a.commitment_state === "awaiting_approval" &&
    b.commitment_state === "awaiting_approval"
  ) {
    // Al deudor ya se le dijo que le confirmábamos: manda la antigüedad.
    return (
      new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
    );
  }
  if (a.commitment_state === "overdue" && b.commitment_state === "overdue") {
    return (b.days_overdue ?? 0) - (a.days_overdue ?? 0);
  }
  if (a.commitment_state === "pending" && b.commitment_state === "pending") {
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
  }

  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
