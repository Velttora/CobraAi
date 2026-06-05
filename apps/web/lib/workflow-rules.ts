import type { WorkflowRule } from "./types";

export type PortfolioAutomationStatus = "none" | "package" | "custom" | undefined;

/** Mínimo necesario para ordenar reglas como las ejecuta la IA en el tiempo. */
export type RuleLifecycleSortable = {
  name: string;
  trigger: string;
  condition?: Record<string, unknown>;
  delayHours?: number;
  delay_hours?: number;
  priority?: number;
};

function ruleDelayHours(rule: RuleLifecycleSortable): number {
  return rule.delayHours ?? rule.delay_hours ?? 0;
}

function rulePriority(rule: RuleLifecycleSortable): number {
  return rule.priority ?? 100;
}

const TRIGGER_LIFECYCLE_ORDER = {
  debt_created: 0,
  debt_updated: 1,
  score_updated: 2,
  schedule: 3,
  promise_broken: 4,
  payment_confirmed: 5,
  manual: 6
} as const;

const AGING_BUCKET_ORDER = {
  future: 0,
  upcoming: 1,
  d0_30: 2,
  d31_60: 3,
  d61_90: 4,
  d91_180: 5,
  d180_plus: 6
} as const;

const UNKNOWN_RANK = 99;

function triggerRank(trigger: string): number {
  return (
    (TRIGGER_LIFECYCLE_ORDER as Record<string, number>)[trigger] ?? UNKNOWN_RANK
  );
}

function bucketRank(bucket: string): number | undefined {
  return (AGING_BUCKET_ORDER as Record<string, number>)[bucket];
}

function agingDaysToBucketRank(days: number): number {
  if (days < 31) return AGING_BUCKET_ORDER.d0_30;
  if (days < 61) return AGING_BUCKET_ORDER.d31_60;
  if (days < 91) return AGING_BUCKET_ORDER.d61_90;
  if (days < 181) return AGING_BUCKET_ORDER.d91_180;
  return AGING_BUCKET_ORDER.d180_plus;
}

function agingRank(condition: Record<string, unknown> | undefined): number {
  const raw = condition?.aging_bucket;
  const buckets = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const ranks = buckets
    .map((bucket) => bucketRank(String(bucket)))
    .filter((rank): rank is number => rank !== undefined);
  if (ranks.length > 0) {
    return Math.min(...ranks);
  }

  const agingDays = condition?.aging_days;
  if (agingDays && typeof agingDays === "object") {
    const threshold = (agingDays as Record<string, unknown>).gte ??
      (agingDays as Record<string, unknown>).gt;
    if (typeof threshold === "number") {
      return agingDaysToBucketRank(threshold);
    }
  }

  return UNKNOWN_RANK;
}

/**
 * Orden cronológico del ciclo de vida del deudor (cómo la IA contactaría en el tiempo):
 * bienvenida → score/prioridad → aging 0-30 → 31-60 → … → promesa rota → pago.
 */
export function compareRuleFiringOrder(
  a: RuleLifecycleSortable,
  b: RuleLifecycleSortable
): number {
  const triggerDiff = triggerRank(a.trigger) - triggerRank(b.trigger);
  if (triggerDiff !== 0) {
    return triggerDiff;
  }

  const agingDiff = agingRank(a.condition) - agingRank(b.condition);
  if (agingDiff !== 0) {
    return agingDiff;
  }

  const delayDiff = ruleDelayHours(a) - ruleDelayHours(b);
  if (delayDiff !== 0) {
    return delayDiff;
  }

  const priorityDiff = rulePriority(a) - rulePriority(b);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return a.name.localeCompare(b.name, "es");
}

/** Reglas activas primero; dentro de cada grupo, orden del ciclo de vida. */
export function sortWorkflowRulesForDisplay(rules: WorkflowRule[]): WorkflowRule[] {
  return [...rules].sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }
    return compareRuleFiringOrder(a, b);
  });
}

export function sortRulesByDebtorLifecycle<T extends RuleLifecycleSortable>(
  rules: T[]
): T[] {
  return [...rules].sort(compareRuleFiringOrder);
}

export function partitionPortfolioRules(
  rules: WorkflowRule[],
  _automationStatus?: PortfolioAutomationStatus
): { activeRules: WorkflowRule[]; inactiveRules: WorkflowRule[] } {
  return {
    activeRules: rules
      .filter((rule) => rule.isActive)
      .sort(compareRuleFiringOrder),
    inactiveRules: rules
      .filter((rule) => !rule.isActive)
      .sort(compareRuleFiringOrder)
  };
}

// ─── Descripción amigable de reglas ──────────────────────────────────────────

export type RuleDescribable = {
  trigger: string;
  condition?: Record<string, unknown>;
  action?: string;
  channel?: string | null;
  delayHours?: number;
  delay_hours?: number;
};

export type WorkflowRuleDescription = {
  /** Cuándo se activa, en lenguaje natural. */
  when: string;
  /** Qué hace la IA. */
  does: string;
  /** Cuándo lo hace respecto al disparador ("", "de inmediato", "1 h después"). */
  timing: string;
  /** Frase completa lista para mostrar. */
  summary: string;
};

const AGING_BUCKET_LABEL: Record<string, string> = {
  future: "aún no vence",
  upcoming: "por vencer",
  d0_30: "0 a 30 días",
  d31_60: "31 a 60 días",
  d61_90: "61 a 90 días",
  d91_180: "91 a 180 días",
  d180_plus: "más de 180 días"
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "correo",
  voice: "llamada con IA",
  portal: "portal"
};

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function comparatorThreshold(
  value: unknown
): { kind: "lt" | "gt" | "eq"; n: number } | undefined {
  if (typeof value === "number") {
    return { kind: "eq", n: value };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const lt = numberValue(obj.lt) ?? numberValue(obj.lte);
    if (lt !== undefined) return { kind: "lt", n: lt };
    const gt = numberValue(obj.gt) ?? numberValue(obj.gte);
    if (gt !== undefined) return { kind: "gt", n: gt };
  }
  return undefined;
}

function agingLabel(condition: Record<string, unknown>): string | undefined {
  const raw = condition.aging_bucket;
  const buckets = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const labels = buckets
    .map((b) => AGING_BUCKET_LABEL[String(b)])
    .filter((l): l is string => Boolean(l));
  if (labels.length > 0) {
    return labels.join(" o ");
  }

  const agingDays = comparatorThreshold(condition.aging_days);
  if (agingDays && agingDays.kind === "gt") {
    return `más de ${agingDays.n} días`;
  }
  return undefined;
}

function describeWhen(rule: RuleDescribable): string {
  const condition = rule.condition ?? {};

  switch (rule.trigger) {
    case "debt_created":
      return "Cuando entra una deuda nueva";
    case "debt_updated":
      return "Cuando se actualiza una deuda";
    case "score_updated": {
      const segment =
        typeof condition.ai_segment === "string"
          ? condition.ai_segment
          : undefined;
      if (segment === "critical") {
        return "Cuando la deuda queda en segmento crítico";
      }
      const score = comparatorThreshold(condition.ai_score);
      if (score?.kind === "lt") {
        const sev = score.n <= 40 ? "muy bajo" : "bajo";
        return `Cuando el score de cobro queda ${sev} (menos de ${score.n})`;
      }
      return "Cuando se recalcula el score de cobro";
    }
    case "schedule": {
      const aging = agingLabel(condition);
      const amount = comparatorThreshold(condition.amount_outstanding);
      if (aging && amount?.kind === "gt") {
        return `Cuando la deuda lleva ${aging} de mora y supera $${amount.n.toLocaleString("es-CO")}`;
      }
      if (aging) {
        return `Cuando la deuda lleva ${aging} de mora`;
      }
      if (amount?.kind === "gt") {
        return `Cuando el saldo supera $${amount.n.toLocaleString("es-CO")}`;
      }
      return "En el seguimiento diario";
    }
    case "promise_broken":
      return "Cuando el deudor incumple una promesa de pago";
    case "payment_confirmed":
      return "Cuando se confirma el pago";
    case "manual":
      return "Cuando se ejecuta manualmente";
    default:
      return "Cuando se cumple la condición";
  }
}

function whenSuffix(condition: Record<string, unknown>): string {
  return condition.whatsapp_opt_in === true ? " (con WhatsApp habilitado)" : "";
}

function describeDoes(rule: RuleDescribable): string {
  switch (rule.action) {
    case "send_notification": {
      const channel = rule.channel ? CHANNEL_LABEL[rule.channel] : undefined;
      if (rule.channel === "voice") return "Hace una llamada con IA";
      if (channel) return `Envía un ${channel}`;
      return "Envía una notificación";
    }
    case "escalate_human":
      return "Escala a un agente humano";
    case "create_task":
      return "Crea una tarea de seguimiento";
    case "assign_strategy":
      return "Asigna una estrategia de cobro";
    case "update_status":
      return "Marca la deuda como pagada";
    default:
      return rule.action ? `Acción: ${rule.action}` : "Ejecuta una acción";
  }
}

function describeTiming(rule: RuleDescribable): string {
  const hours = rule.delayHours ?? rule.delay_hours ?? 0;
  if (!hours) return "";
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 día después" : `${days} días después`;
  }
  return hours === 1 ? "1 hora después" : `${hours} horas después`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Traduce una regla técnica a lenguaje claro para el usuario final.
 * Ej: "Cuando el score de cobro queda bajo (menos de 60) → Envía un WhatsApp (1 hora después)".
 */
export function describeWorkflowRule(
  rule: RuleDescribable
): WorkflowRuleDescription {
  const condition = rule.condition ?? {};
  const when = `${describeWhen(rule)}${whenSuffix(condition)}`;
  const does = describeDoes(rule);
  const timing = describeTiming(rule);

  const timingText = timing ? ` ${timing}` : "";
  const summary = `${when}, ${lowerFirst(does)}${timingText}.`;

  return { when, does, timing, summary };
}
