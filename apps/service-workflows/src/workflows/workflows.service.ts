import {
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ComplianceService } from "@cobrai/compliance";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@cobrai/db";
import type {
  ContactChannel,
  Debt,
  DebtStatus,
  Prisma,
  WorkflowRule
} from "@cobrai/db";
import {
  daysSinceLastContact,
  getAgingBucket,
  planOperationalScores
} from "@cobrai/utils";
import { startOfTodayUtc } from "@cobrai/utils";
import {
  computeAgingDays,
  decimalToNumber
} from "../common/utils/api.utils";
import { KafkaService } from "../kafka/kafka.service";
import { RuleEngineService } from "../rule-engine/rule-engine.service";
import {
  canTransition,
  resolveTransition,
  type WorkflowEvent
} from "../state-machine/state-machine.service";
import type {
  CreateWorkflowRuleDto,
  UpdateWorkflowRuleDto
} from "./dto/workflow-rule.dto";

type DebtContext = Debt & { debtor?: { whatsappOptIn: boolean } | null };

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService,
    private readonly rules: RuleEngineService,
    private readonly config: ConfigService,
    private readonly compliance: ComplianceService
  ) {}

  async handleDebtCreated(
    tenantId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const debtId = String(payload.debt_id ?? "");
    if (!debtId) return;

    await this.applyTransition(tenantId, debtId, "DEBT_CREATED");
    await this.evaluateTriggerRules(tenantId, debtId, "debt_created");
  }

  async handleDebtSegmented(
    tenantId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const debtId = String(payload.debt_id ?? "");
    if (!debtId) return;

    await this.applyTransition(tenantId, debtId, "DEBT_SEGMENTED");
    await this.evaluateTriggerRules(tenantId, debtId, "score_updated");
  }

  async handleContactCompleted(
    tenantId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const debtId = String(payload.debt_id ?? "");
    const outcome = String(payload.outcome ?? "");
    if (!debtId) return;

    const debt = await this.getDebt(tenantId, debtId);
    const attempts =
      Number((debt.metadata as Record<string, unknown>)?.contact_attempts ?? 0) +
      1;

    await this.prisma.debt.update({
      where: { id: debtId },
      data: {
        metadata: {
          ...(debt.metadata as object),
          last_contact_outcome: outcome,
          contact_attempts: attempts
        }
      }
    });

    if (outcome === "promise_made") {
      await this.applyTransition(tenantId, debtId, "PROMISE_MADE");
    } else if (outcome === "refused") {
      await this.applyTransition(tenantId, debtId, "DISPUTED");
    } else if (outcome === "no_answer" || outcome === "voicemail") {
      if (attempts >= 3) {
        await this.applyTransition(tenantId, debtId, "NO_RESPONSE_THRESHOLD");
      }
    }
  }

  async handlePaymentConfirmed(
    tenantId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const debtId = String(payload.debt_id ?? "");
    if (!debtId) return;

    const outstanding = Number(payload.amount_outstanding ?? 0);
    await this.applyTransition(
      tenantId,
      debtId,
      "PAYMENT_CONFIRMED",
      outstanding > 0 ? "paid_partial" : "paid_full"
    );
    await this.evaluateTriggerRules(tenantId, debtId, "payment_confirmed");
  }

  async triggerDebtEvaluation(
    tenantId: string,
    debtId: string
  ): Promise<Debt> {
    const debt = await this.getDebt(tenantId, debtId);
    await this.evaluateTriggerRules(tenantId, debtId, "manual");
    return debt;
  }

  async getQueue(tenantId: string) {
    const today = startOfTodayUtc();
    const enabledPortfolios = await this.prisma.portfolio.findMany({
      where: {
        tenantId,
        deletedAt: null,
        automationStatus: { not: "none" }
      },
      select: { id: true, name: true }
    });
    const portfolioIds = enabledPortfolios.map((p) => p.id);
    const portfolioNameById = new Map(
      enabledPortfolios.map((p) => [p.id, p.name])
    );

    const debts =
      portfolioIds.length === 0
        ? []
        : await this.prisma.debt.findMany({
            where: {
              tenantId,
              deletedAt: null,
              portfolioId: { in: portfolioIds },
              status: { in: ["active", "contacted", "promised"] }
            },
            include: { debtor: true },
            take: 200
          });

    const activeRules = await this.prisma.workflowRule.findMany({
      where: {
        tenantId,
        portfolioId: { in: portfolioIds },
        isActive: true,
        deletedAt: null,
        trigger: "schedule"
      },
      orderBy: { priority: "asc" }
    });

    const grouped: Record<
      string,
      { channel: string; count: number; debts: unknown[] }
    > = {};
    const byPortfolio: Record<
      string,
      {
        portfolio_id: string;
        portfolio_name: string;
        total: number;
        by_channel: Record<string, number>;
      }
    > = {};

    for (const debt of debts) {
      const matching = activeRules.filter(
        (rule) =>
          rule.portfolioId === debt.portfolioId &&
          this.rules.matchesCondition(
            debt,
            debt.debtor,
            rule.condition as Record<string, unknown>
          )
      );
      if (matching.length === 0) continue;

      const rule = matching[0]!;
      const channel = (rule.channel ?? debt.bestChannel ?? "email") as string;
      if (!grouped[channel]) {
        grouped[channel] = { channel, count: 0, debts: [] };
      }
      grouped[channel].count += 1;
      grouped[channel].debts.push({
        debt_id: debt.id,
        portfolio_id: debt.portfolioId,
        debtor_name: debt.debtor.name,
        amount_outstanding: decimalToNumber(debt.amountOutstanding),
        ai_score: debt.aiScore,
        rule_id: rule.id,
        rule_name: rule.name
      });

      const portfolioKey = debt.portfolioId ?? "unknown";
      if (!byPortfolio[portfolioKey]) {
        byPortfolio[portfolioKey] = {
          portfolio_id: portfolioKey,
          portfolio_name: portfolioNameById.get(portfolioKey) ?? portfolioKey,
          total: 0,
          by_channel: {}
        };
      }
      byPortfolio[portfolioKey].total += 1;
      byPortfolio[portfolioKey].by_channel[channel] =
        (byPortfolio[portfolioKey].by_channel[channel] ?? 0) + 1;
    }

    const alreadyExecuted = await this.prisma.workflowExecution.findMany({
      where: {
        tenantId,
        createdAt: { gte: today },
        status: { in: ["completed", "running", "pending"] }
      },
      select: { debtId: true }
    });
    const executedSet = new Set(alreadyExecuted.map((e) => e.debtId));

    const items = Object.values(grouped).map((group) => ({
      ...group,
      debts: group.debts.filter(
        (d) => !executedSet.has((d as { debt_id: string }).debt_id)
      ),
      count: group.debts.filter(
        (d) => !executedSet.has((d as { debt_id: string }).debt_id)
      ).length
    }));

    const deferred = await this.prisma.debt.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: ["future", "upcoming"] }
      },
      select: {
        status: true,
        amountOutstanding: true,
        dueDate: true,
        scheduledCollectionDate: true
      }
    });

    const upcomingDebts = deferred.filter((d) => d.status === "upcoming");
    const futureDebts = deferred.filter((d) => d.status === "future");
    const nextActivation = upcomingDebts
      .map((d) => d.scheduledCollectionDate ?? d.dueDate)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const byChannel = items.reduce<Record<string, number>>((acc, row) => {
      acc[row.channel] = row.count;
      return acc;
    }, {});

    return {
      date: today.toISOString().slice(0, 10),
      items,
      total: items.reduce((sum, row) => sum + row.count, 0),
      scheduled_today: items.reduce((sum, row) => sum + row.count, 0),
      by_channel: byChannel,
      by_portfolio: Object.values(byPortfolio),
      deferred_pipeline: {
        upcoming_debts: upcomingDebts.length,
        future_debts: futureDebts.length,
        upcoming_amount: upcomingDebts.reduce(
          (s, d) => s + decimalToNumber(d.amountOutstanding),
          0
        ),
        future_amount: futureDebts.reduce(
          (s, d) => s + decimalToNumber(d.amountOutstanding),
          0
        ),
        next_activation_date: nextActivation
          ? nextActivation.toISOString().slice(0, 10)
          : null
      }
    };
  }

  async getStats(tenantId: string) {
    const today = startOfTodayUtc();

    const [executionsToday, activePromises, escalationsToday, contactsToday] =
      await Promise.all([
        this.prisma.workflowExecution.count({
          where: { tenantId, createdAt: { gte: today }, deletedAt: null }
        }),
        this.prisma.promiseToPay.count({
          where: {
            tenantId,
            status: "pending",
            deletedAt: null
          }
        }),
        this.prisma.workflowExecution.count({
          where: {
            tenantId,
            createdAt: { gte: today },
            deletedAt: null,
            rule: { action: "escalate_human" }
          }
        }),
        this.prisma.contact.count({
          where: { tenantId, createdAt: { gte: today }, deletedAt: null }
        })
      ]);

    return {
      contacts_today: contactsToday,
      active_promises: activePromises,
      escalations_today: escalationsToday,
      executions_today: executionsToday
    };
  }

  async getContactsTodayDetail(tenantId: string) {
    const today = startOfTodayUtc();
    return this.prisma.contact.findMany({
      where: { tenantId, createdAt: { gte: today }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        channel: true,
        status: true,
        outcome: true,
        createdAt: true,
        debtor: { select: { id: true, name: true } },
        debt: { select: { id: true, portfolio: { select: { id: true, name: true } } } }
      }
    });
  }

  async getActivePromisesDetail(tenantId: string) {
    return this.prisma.promiseToPay.findMany({
      where: { tenantId, status: "pending", deletedAt: null },
      orderBy: { promisedDate: "asc" },
      take: 100,
      select: {
        id: true,
        promisedDate: true,
        amount: true,
        createdAt: true,
        debt: {
          select: {
            id: true,
            currency: true,
            amountOutstanding: true,
            portfolio: { select: { id: true, name: true } },
            debtor: { select: { id: true, name: true } }
          }
        }
      }
    });
  }

  async getEscalationsTodayDetail(tenantId: string) {
    const today = startOfTodayUtc();
    return this.prisma.workflowExecution.findMany({
      where: {
        tenantId,
        createdAt: { gte: today },
        deletedAt: null,
        rule: { action: "escalate_human" }
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        status: true,
        rule: { select: { id: true, name: true, action: true } },
        debt: {
          select: {
            id: true,
            portfolio: { select: { id: true, name: true } },
            debtor: { select: { id: true, name: true } }
          }
        }
      }
    });
  }

  async listRules(tenantId: string, portfolioId: string) {
    return this.prisma.workflowRule.findMany({
      where: { tenantId, portfolioId, deletedAt: null },
      orderBy: [{ isActive: "desc" }, { priority: "asc" }]
    });
  }

  async createRule(tenantId: string, dto: CreateWorkflowRuleDto) {
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: dto.portfolio_id, tenantId, deletedAt: null }
    });
    if (!portfolio) {
      throw new NotFoundException("Portafolio no encontrado");
    }

    const rule = await this.prisma.workflowRule.create({
      data: {
        tenantId,
        portfolioId: dto.portfolio_id,
        name: dto.name,
        trigger: dto.trigger,
        condition: dto.condition as Prisma.InputJsonValue,
        action: dto.action,
        channel: dto.channel,
        delayHours: dto.delay_hours ?? 0,
        priority: dto.priority ?? 100,
        isActive: dto.is_active ?? true,
        templateId: dto.template_id ?? null
      }
    });

    await this.syncPortfolioAutomationStatus(tenantId, dto.portfolio_id);
    return rule;
  }

  async updateRule(tenantId: string, id: string, dto: UpdateWorkflowRuleDto) {
    const rule = await this.getRule(tenantId, id);
    const updated = await this.prisma.workflowRule.update({
      where: { id },
      data: {
        name: dto.name,
        condition: dto.condition as Prisma.InputJsonValue | undefined,
        action: dto.action,
        channel: dto.channel,
        delayHours: dto.delay_hours,
        priority: dto.priority,
        isActive: dto.is_active,
        ...(dto.template_id !== undefined && { templateId: dto.template_id })
      }
    });
    if (rule.portfolioId) {
      await this.syncPortfolioAutomationStatus(tenantId, rule.portfolioId);
    }
    return updated;
  }

  async deactivateRule(tenantId: string, id: string) {
    const rule = await this.getRule(tenantId, id);
    const updated = await this.prisma.workflowRule.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() }
    });
    if (rule.portfolioId) {
      await this.syncPortfolioAutomationStatus(tenantId, rule.portfolioId);
    }
    return updated;
  }

  async evaluateTenant(
    tenantId: string
  ): Promise<{ contacts: number; by_portfolio: Record<string, number> }> {
    const enabledPortfolios = await this.prisma.portfolio.findMany({
      where: {
        tenantId,
        deletedAt: null,
        automationStatus: { not: "none" }
      },
      select: { id: true }
    });

    let contacts = 0;
    const byPortfolio: Record<string, number> = {};

    for (const portfolio of enabledPortfolios) {
      const scheduleRules = await this.prisma.workflowRule.findMany({
        where: {
          tenantId,
          portfolioId: portfolio.id,
          trigger: "schedule",
          isActive: true,
          deletedAt: null
        },
        orderBy: { priority: "asc" }
      });

      const debts = await this.prisma.debt.findMany({
        where: {
          tenantId,
          portfolioId: portfolio.id,
          deletedAt: null,
          status: { in: ["active", "contacted"] }
        },
        include: { debtor: { include: { consents: true } } }
      });

      let portfolioContacts = 0;
      for (const debt of debts) {
        for (const rule of scheduleRules) {
          if (
            !this.rules.matchesCondition(
              debt,
              debt.debtor,
              rule.condition as Record<string, unknown>
            )
          ) {
            continue;
          }
          const sent = await this.executeRuleAction(tenantId, debt, rule);
          if (sent) {
            contacts += 1;
            portfolioContacts += 1;
          }
          break;
        }

        if (await this.shouldEscalateLegal(debt)) {
          await this.applyTransition(tenantId, debt.id, "NO_RESPONSE_THRESHOLD");
          await this.escalateDebt(tenantId, debt.id, "legal_auto", "legal_risk");
        }
      }

      if (portfolioContacts > 0) {
        byPortfolio[portfolio.id] = portfolioContacts;
      }
    }

    return { contacts, by_portfolio: byPortfolio };
  }

  async runSchedulerCycle(): Promise<{ processed: number; contacts: number }> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true }
    });

    let processed = 0;
    let contacts = 0;

    for (const tenant of tenants) {
      const result = await this.runTenantScheduler(tenant.id);
      processed += result.processed;
      contacts += result.contacts;
    }

    this.logger.log(`Scheduler: processed=${processed} contacts=${contacts}`);
    return { processed, contacts };
  }

  async runTenantScheduler(tenantId: string) {
    let processed = 0;
    let contacts = 0;

    await this.runDeferredTransitions(tenantId);

    const activeDebts = await this.prisma.debt.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: {
          in: ["new", "analyzing", "active", "contacted", "promised", "legal_risk"]
        }
      },
      include: { debtor: { include: { consents: true } } }
    });

    for (const debt of activeDebts) {
      const bucket = getAgingBucket(debt.dueDate);
      if (debt.agingBucket !== bucket) {
        await this.prisma.debt.update({
          where: { id: debt.id },
          data: { agingBucket: bucket }
        });
      }
      processed += 1;
    }

    await this.refreshPriorityScoresForTenant(tenantId, activeDebts);

    const brokenPromises = await this.prisma.promiseToPay.findMany({
      where: {
        tenantId,
        status: "pending",
        promisedDate: { lt: startOfTodayUtc() },
        deletedAt: null
      }
    });

    for (const promise of brokenPromises) {
      await this.prisma.promiseToPay.update({
        where: { id: promise.id },
        data: { status: "broken" }
      });
      await this.applyTransition(tenantId, promise.debtId, "PROMISE_BROKEN");
      await this.evaluateTriggerRules(tenantId, promise.debtId, "promise_broken");
    }

    const scheduleEvaluation = await this.evaluateTenant(tenantId);
    contacts += scheduleEvaluation.contacts;

    return { processed, contacts };
  }

  private async syncPortfolioAutomationStatus(
    tenantId: string,
    portfolioId: string
  ): Promise<void> {
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, tenantId, deletedAt: null }
    });
    if (!portfolio) return;

    const activeRules = await this.prisma.workflowRule.findMany({
      where: {
        tenantId,
        portfolioId,
        deletedAt: null,
        isActive: true
      },
      select: { condition: true }
    });

    if (activeRules.length === 0) {
      await this.prisma.portfolio.update({
        where: { id: portfolioId },
        data: { automationStatus: "none", activePackageSlug: null }
      });
      return;
    }

    const packageSlugs = new Set(
      activeRules
        .map((rule) => {
          const condition = rule.condition as Record<string, unknown>;
          return typeof condition.__source_package === "string"
            ? condition.__source_package
            : null;
        })
        .filter((slug): slug is string => Boolean(slug))
    );

    const customRules = activeRules.some((rule) => {
      const condition = rule.condition as Record<string, unknown>;
      return !condition.__source_package;
    });

    if (customRules) {
      await this.prisma.portfolio.update({
        where: { id: portfolioId },
        data: { automationStatus: "custom" }
      });
      return;
    }

    if (packageSlugs.size === 1) {
      const [slug] = [...packageSlugs];
      await this.prisma.portfolio.update({
        where: { id: portfolioId },
        data: {
          automationStatus: "package",
          activePackageSlug: slug ?? null
        }
      });
    }
  }

  private async evaluateTriggerRules(
    tenantId: string,
    debtId: string,
    trigger: WorkflowRule["trigger"]
  ): Promise<void> {
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId, deletedAt: null },
      include: { debtor: true }
    });
    if (!debt) return;

    if (!debt?.portfolioId) return;

    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: debt.portfolioId, tenantId, deletedAt: null },
      select: { automationStatus: true }
    });
    if (!portfolio || portfolio.automationStatus === "none") return;

    const rules = await this.prisma.workflowRule.findMany({
      where: {
        tenantId,
        portfolioId: debt.portfolioId,
        trigger,
        isActive: true,
        deletedAt: null
      },
      orderBy: { priority: "asc" }
    });

    for (const rule of rules) {
      if (rule.portfolioId !== debt.portfolioId) continue;
      if (
        !this.rules.matchesCondition(
          debt,
          debt.debtor,
          rule.condition as Record<string, unknown>
        )
      ) {
        continue;
      }
      await this.executeRuleAction(tenantId, debt, rule);
    }
  }

  private async executeRuleAction(
    tenantId: string,
    debt: DebtContext,
    rule: WorkflowRule
  ): Promise<boolean> {
    if (rule.portfolioId && rule.portfolioId !== debt.portfolioId) {
      return false;
    }

    const execution = await this.prisma.workflowExecution.create({
      data: {
        tenantId,
        debtId: debt.id,
        ruleId: rule.id,
        status: "running",
        executedAt: new Date(),
        result: { action: rule.action, channel: rule.channel }
      }
    });

    try {
      switch (rule.action) {
        case "send_notification":
          await this.requestContact(
            tenantId,
            debt,
            (rule.channel ?? debt.bestChannel ?? "email") as ContactChannel,
            rule
          );
          break;
        case "escalate_human":
          await this.escalateDebt(tenantId, debt.id, rule.id, "human", rule.name);
          break;
        case "update_status":
          await this.applyTransition(tenantId, debt.id, "PAYMENT_CONFIRMED", "paid_full");
          break;
        case "assign_strategy":
          await this.prisma.debt.update({
            where: { id: debt.id },
            data: {
              metadata: {
                ...(debt.metadata as object),
                assigned_strategy: rule.name
              }
            }
          });
          break;
        case "create_task":
          await this.escalateDebt(tenantId, debt.id, rule.id, "task", rule.name);
          break;
      }

      await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: "completed",
          result: {
            action: rule.action,
            channel: rule.channel,
            alert: rule.action === "escalate_human"
          }
        }
      });
      return rule.action === "send_notification";
    } catch (err) {
      await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: "failed",
          result: {
            error: err instanceof Error ? err.message : "unknown"
          }
        }
      });
      return false;
    }
  }

  private async requestContact(
    tenantId: string,
    debt: DebtContext,
    channel: ContactChannel,
    rule: WorkflowRule
  ): Promise<void> {
    // Solo verificamos elegibilidad permanente (opt-out, consentimiento, WhatsApp opt-in).
    // La frecuencia semanal la gestiona el DebtorContactCoordinator en service-notifications,
    // que agrupa todas las deudas del mismo deudor antes de disparar un único contacto.
    const check = await this.compliance.isChannelEligible({
      tenantId,
      debtorId: debt.debtorId,
      channel
    });

    if (!check.allowed) {
      this.logger.warn(
        `Contacto descartado debt=${debt.id} channel=${channel} reason=${check.reason}`
      );
      await this.prisma.workflowExecution.create({
        data: {
          tenantId,
          debtId: debt.id,
          ruleId: rule.id,
          status: "skipped",
          executedAt: new Date(),
          result: { blocked: true, reason: check.reason, channel }
        }
      });
      return;
    }

    if (rule.trigger !== "payment_confirmed") {
      await this.applyTransition(tenantId, debt.id, "CONTACT_STARTED");
    }

    const templateHint =
      rule.trigger === "payment_confirmed"
        ? "agradecimiento"
        : "workflow_automation";

    // Publicar al coordinator en lugar de al executor directo.
    // El coordinator decide si este deudor ya fue contactado esta semana
    // y, de ser así, registra la deuda como pendiente para mencionarla en
    // el próximo contacto.
    await this.kafka.publish("cobrai.debtor.contact_queue", tenantId, {
      debt_id: debt.id,
      debtor_id: debt.debtorId,
      channel,
      rule_id: rule.id,
      template_id: rule.templateId ?? undefined,
      template_hint: templateHint,
      priority_score: debt.priorityScore ?? 0
    });
  }

  private async escalateDebt(
    tenantId: string,
    debtId: string,
    ruleId: string,
    target: "human" | "legal" | "legal_risk" | "task",
    ruleName?: string
  ): Promise<void> {
    if (target === "legal" || target === "legal_risk") {
      await this.applyTransition(tenantId, debtId, "ESCALATE_LEGAL");
    }

    await this.kafka.publish("cobrai.debt.escalated", tenantId, {
      debt_id: debtId,
      rule_id: ruleId,
      rule_name: ruleName ?? ruleId,
      target
    });
  }

  private async applyTransition(
    tenantId: string,
    debtId: string,
    event: WorkflowEvent,
    forceTo?: DebtStatus
  ): Promise<void> {
    const debt = await this.getDebt(tenantId, debtId);

    if (forceTo) {
      await this.prisma.debt.update({
        where: { id: debtId },
        data: { status: forceTo }
      });
      return;
    }

    const next = resolveTransition(debt.status, event);
    if (!next || !canTransition(debt.status, event)) {
      this.logger.debug(
        `Transición inválida ${debt.status} + ${event} para deuda ${debtId}`
      );
      return;
    }

    await this.prisma.debt.update({
      where: { id: debtId },
      data: { status: next }
    });
  }

  private async shouldEscalateLegal(
    debt: Debt & {
      debtor: { consents: { channel: string }[]; whatsappOptIn: boolean } | null;
    }
  ): Promise<boolean> {
    const agingDays = computeAgingDays(debt.dueDate);
    const maxScore = Number(this.config.get("LEGAL_ESCALATION_MAX_SCORE") ?? 20);
    const agingThreshold = Number(
      this.config.get("LEGAL_ESCALATION_AGING_DAYS") ?? 180
    );
    const amountThreshold = Number(
      this.config.get("LEGAL_ESCALATION_AMOUNT_USD") ?? 10000
    );

    const brokenPromises = await this.prisma.promiseToPay.count({
      where: { debtId: debt.id, status: "broken", deletedAt: null }
    });

    const amount = decimalToNumber(debt.amountOutstanding);
    const noConsent =
      debt.debtor?.consents.length === 0 && !debt.debtor?.whatsappOptIn;

    return (
      (agingDays > agingThreshold &&
        (debt.aiScore ?? 100) < maxScore &&
        amount >= amountThreshold) ||
      brokenPromises >= 5 ||
      noConsent
    );
  }

  private async runDeferredTransitions(tenantId: string): Promise<void> {
    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setUTCDate(in30Days.getUTCDate() + 30);

    const nowUpcoming = await this.prisma.debt.findMany({
      where: {
        tenantId,
        status: "future",
        deletedAt: null,
        OR: [
          { scheduledCollectionDate: { lte: in30Days } },
          { scheduledCollectionDate: null, dueDate: { lte: in30Days } }
        ]
      },
      select: { id: true, tenantId: true, dueDate: true }
    });

    for (const debt of nowUpcoming) {
      await this.prisma.debt.update({
        where: { id: debt.id },
        data: { status: "upcoming", agingBucket: "upcoming" }
      });
      await this.kafka.publish("cobrai.debt.status_changed", tenantId, {
        debt_id: debt.id,
        tenant_id: debt.tenantId,
        from_status: "future",
        to_status: "upcoming",
        reason: "due_date_approaching_30d"
      });
    }
    this.logger.log(
      `Transición future→upcoming (${tenantId}): ${nowUpcoming.length} deudas`
    );

    const nowNew = await this.prisma.debt.findMany({
      where: {
        tenantId,
        status: "upcoming",
        deletedAt: null,
        OR: [
          { scheduledCollectionDate: { lte: now } },
          { scheduledCollectionDate: null, dueDate: { lte: now } }
        ]
      },
      select: { id: true, tenantId: true, dueDate: true }
    });

    for (const debt of nowNew) {
      const agingBucket = getAgingBucket(debt.dueDate);
      await this.prisma.debt.update({
        where: { id: debt.id },
        data: { status: "new", agingBucket: agingBucket as never }
      });
      await this.kafka.publish("cobrai.debt.created", tenantId, {
        debt_id: debt.id,
        tenant_id: debt.tenantId,
        due_date: debt.dueDate.toISOString(),
        source: "deferred_activation"
      });
      await this.kafka.publish("cobrai.debt.status_changed", tenantId, {
        debt_id: debt.id,
        tenant_id: debt.tenantId,
        from_status: "upcoming",
        to_status: "new",
        reason: "collection_date_reached"
      });
    }
    this.logger.log(
      `Transición upcoming→new (${tenantId}): ${nowNew.length} deudas activadas`
    );
  }

  private async refreshPriorityScoresForTenant(
    tenantId: string,
    activeDebts: Array<
      Debt & {
        debtor: {
          whatsappOptIn: boolean;
          email: string | null;
          phones: unknown;
        };
      }
    >
  ): Promise<void> {
    if (activeDebts.length === 0) return;

    const maxByPortfolio = new Map<string, number>();
    for (const debt of activeDebts) {
      const amt = decimalToNumber(debt.amountOutstanding);
      maxByPortfolio.set(
        debt.portfolioId,
        Math.max(maxByPortfolio.get(debt.portfolioId) ?? 0, amt)
      );
    }

    const lastContacts = await this.prisma.contact.groupBy({
      by: ["debtId"],
      where: { tenantId, deletedAt: null },
      _max: { createdAt: true }
    });
    const lastContactByDebt = new Map(
      lastContacts.map((row) => [row.debtId, row._max.createdAt ?? null])
    );

    for (const debt of activeDebts) {
      const recoveryScore = debt.aiScore ?? 50;
      const phones = Array.isArray(debt.debtor.phones)
        ? (debt.debtor.phones as string[])
        : [];
      const operational = planOperationalScores({
        recovery_score: recoveryScore,
        amount_outstanding: decimalToNumber(debt.amountOutstanding),
        days_since_last_contact: daysSinceLastContact(
          lastContactByDebt.get(debt.id) ?? null
        ),
        max_amount_in_portfolio: maxByPortfolio.get(debt.portfolioId) ?? 1,
        aging_days: computeAgingDays(debt.dueDate),
        debt_status: debt.status,
        has_whatsapp: debt.debtor.whatsappOptIn,
        has_phone: phones.length > 0,
        has_email: Boolean(debt.debtor.email?.trim())
      });

      await this.prisma.debt.update({
        where: { id: debt.id },
        data: {
          priorityScore: operational.priority_score,
          aiSegment: operational.segment,
          riskLevel: operational.segment,
          bestChannel: operational.best_channel
        }
      });
    }
  }

  private async getDebt(tenantId: string, debtId: string): Promise<Debt> {
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId, deletedAt: null }
    });
    if (!debt) {
      throw new NotFoundException("Deuda no encontrada");
    }
    return debt;
  }

  private async getRule(tenantId: string, id: string): Promise<WorkflowRule> {
    const rule = await this.prisma.workflowRule.findFirst({
      where: { id, tenantId, deletedAt: null }
    });
    if (!rule) {
      throw new NotFoundException("Regla no encontrada");
    }
    return rule;
  }
}
