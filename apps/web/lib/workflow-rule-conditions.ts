/** Rangos por defecto al migrar reglas legacy con `aging_bucket`. */
export const AGING_BUCKET_DEFAULT_RANGES: Record<
  string,
  { min: number; max?: number }
> = {
  d0_30: { min: 0, max: 30 },
  d31_60: { min: 31, max: 60 },
  d61_90: { min: 61, max: 90 },
  d91_180: { min: 91, max: 180 },
  d180_plus: { min: 181 }
};

export type AgingDaysRange = {
  min?: number;
  max?: number;
};

/** Alias semántico: días que faltan para el vencimiento (deuda aún sin mora). */
export type PreDueDaysRange = AgingDaysRange;

function readBound(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** La regla filtra por días antes del vencimiento (no por mora). */
export function conditionTargetsPreDue(
  condition?: Record<string, unknown>
): boolean {
  return Boolean(
    condition &&
      Object.prototype.hasOwnProperty.call(condition, "days_to_due")
  );
}

/** Extrae un rango de días antes del vencimiento desde la condición de una regla. */
export function parseDaysToDueRangeFromCondition(
  condition: Record<string, unknown> | undefined
): PreDueDaysRange | null {
  if (!condition) return null;

  const daysToDue = condition.days_to_due;
  if (!daysToDue || typeof daysToDue !== "object" || Array.isArray(daysToDue)) {
    return null;
  }

  const obj = daysToDue as Record<string, unknown>;
  const min =
    readBound(obj.gte) ??
    (readBound(obj.gt) !== undefined ? readBound(obj.gt)! + 1 : undefined);
  const max =
    readBound(obj.lte) ??
    (readBound(obj.lt) !== undefined ? readBound(obj.lt)! - 1 : undefined);

  if (min !== undefined || max !== undefined) {
    return { min, max };
  }

  return null;
}

/** Construye `days_to_due` en la condición y elimina campos de mora. */
export function applyPreDueRangeToCondition(
  condition: Record<string, unknown>,
  range: PreDueDaysRange
): Record<string, unknown> {
  const next = { ...condition };
  delete next.aging_days;
  delete next.aging_bucket;

  const days_to_due: Record<string, number> = {};
  if (range.min !== undefined) days_to_due.gte = range.min;
  if (range.max !== undefined) days_to_due.lte = range.max;

  if (Object.keys(days_to_due).length > 0) {
    next.days_to_due = days_to_due;
  } else {
    delete next.days_to_due;
  }

  return next;
}

/** Extrae un rango de días de mora desde la condición de una regla. */
export function parseAgingRangeFromCondition(
  condition: Record<string, unknown> | undefined
): AgingDaysRange | null {
  if (!condition) return null;

  const agingDays = condition.aging_days;
  if (agingDays && typeof agingDays === "object" && !Array.isArray(agingDays)) {
    const obj = agingDays as Record<string, unknown>;
    const min =
      readBound(obj.gte) ??
      (readBound(obj.gt) !== undefined ? readBound(obj.gt)! + 1 : undefined);
    const max =
      readBound(obj.lte) ??
      (readBound(obj.lt) !== undefined ? readBound(obj.lt)! - 1 : undefined);
    if (min !== undefined || max !== undefined) {
      return { min, max };
    }
  }

  const raw = condition.aging_bucket;
  const buckets = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  if (buckets.length === 0) return null;

  let min: number | undefined;
  let max: number | undefined;
  for (const bucket of buckets) {
    const preset = AGING_BUCKET_DEFAULT_RANGES[String(bucket)];
    if (!preset) continue;
    min = min === undefined ? preset.min : Math.min(min, preset.min);
    if (preset.max === undefined) {
      max = undefined;
    } else {
      max = max === undefined ? preset.max : Math.max(max, preset.max);
    }
  }

  return min !== undefined || max !== undefined ? { min, max } : null;
}

/** Construye `aging_days` en la condición y elimina `aging_bucket` legacy. */
export function applyAgingRangeToCondition(
  condition: Record<string, unknown>,
  range: AgingDaysRange
): Record<string, unknown> {
  const next = { ...condition };
  delete next.aging_bucket;

  const aging_days: Record<string, number> = {};
  if (range.min !== undefined) aging_days.gte = range.min;
  if (range.max !== undefined) aging_days.lte = range.max;

  if (Object.keys(aging_days).length > 0) {
    next.aging_days = aging_days;
  } else {
    delete next.aging_days;
  }

  return next;
}

export function buildRuleCondition(input: {
  trigger: string;
  agingMinDays: string;
  agingMaxDays: string;
  existing?: Record<string, unknown>;
}): Record<string, unknown> {
  const base = { ...(input.existing ?? {}) };

  if (showsPreDueRangeField(input.trigger, base)) {
    const min =
      input.agingMinDays.trim() !== "" ? Number(input.agingMinDays) : undefined;
    const max =
      input.agingMaxDays.trim() !== "" ? Number(input.agingMaxDays) : undefined;
    return applyPreDueRangeToCondition(base, { min, max });
  }

  const usesAgingRange =
    input.trigger === "schedule" ||
    parseAgingRangeFromCondition(base) !== null;

  if (usesAgingRange) {
    const min =
      input.agingMinDays.trim() !== "" ? Number(input.agingMinDays) : undefined;
    const max =
      input.agingMaxDays.trim() !== "" ? Number(input.agingMaxDays) : undefined;
    return applyAgingRangeToCondition(base, { min, max });
  }

  if (input.trigger === "debt_created" && base.status === undefined) {
    return { ...base, status: "new" };
  }

  return base;
}

export function showsPreDueRangeField(
  trigger: string | undefined,
  condition?: Record<string, unknown>
): boolean {
  return trigger === "schedule" && conditionTargetsPreDue(condition);
}

export function showsAgingRangeField(
  trigger: string | undefined,
  condition?: Record<string, unknown>
): boolean {
  if (conditionTargetsPreDue(condition)) return false;
  if (trigger === "schedule") return true;
  return parseAgingRangeFromCondition(condition) !== null;
}

/** Etiqueta legible para un rango de mora parametrizado. */
export function formatAgingRangeLabel(range: AgingDaysRange): string {
  const { min, max } = range;
  if (min !== undefined && max !== undefined) {
    if (min === max) return `día ${min} de mora`;
    return `de ${min} a ${max} días de mora`;
  }
  if (min !== undefined) return `desde el día ${min} de mora`;
  if (max !== undefined) return `hasta el día ${max} de mora`;
  return "sin rango definido";
}

export function formatPreDueRangeLabel(range: PreDueDaysRange): string {
  const { min, max } = range;
  if (min !== undefined && max !== undefined) {
    if (min === max) {
      return min === 1
        ? "falta 1 día para el vencimiento"
        : `faltan ${min} días para el vencimiento`;
    }
    return `faltan entre ${min} y ${max} días para el vencimiento`;
  }
  if (min !== undefined) {
    return `faltan al menos ${min} día${min === 1 ? "" : "s"} para el vencimiento`;
  }
  if (max !== undefined) {
    return `faltan como máximo ${max} día${max === 1 ? "" : "s"} para el vencimiento`;
  }
  return "aún no ha vencido";
}

export function validatePreDueRangeForm(
  minDays: string,
  maxDays: string
): string | null {
  const min = minDays.trim() !== "" ? Number(minDays) : undefined;
  const max = maxDays.trim() !== "" ? Number(maxDays) : undefined;

  if (min !== undefined && (min < 1 || !Number.isFinite(min))) {
    return "El mínimo debe ser al menos 1 día antes del vencimiento.";
  }
  if (max !== undefined && (max < 1 || !Number.isFinite(max))) {
    return "El máximo debe ser al menos 1 día antes del vencimiento.";
  }
  if (min === undefined && max === undefined) {
    return "Indica al menos el mínimo o el máximo de días antes del vencimiento.";
  }
  if (min !== undefined && max !== undefined && min > max) {
    return "El mínimo de días antes no puede ser mayor que el máximo.";
  }
  return null;
}

export function validateAgingRangeForm(
  agingMinDays: string,
  agingMaxDays: string
): string | null {
  const min = agingMinDays.trim() !== "" ? Number(agingMinDays) : undefined;
  const max = agingMaxDays.trim() !== "" ? Number(agingMaxDays) : undefined;

  if (min !== undefined && (min < 0 || !Number.isFinite(min))) {
    return "El día inicial debe ser 0 o mayor.";
  }
  if (max !== undefined && (max < 0 || !Number.isFinite(max))) {
    return "El día final debe ser 0 o mayor.";
  }
  if (min === undefined && max === undefined) {
    return "Indica al menos el día inicial o final de mora.";
  }
  if (min !== undefined && max !== undefined && min > max) {
    return "El día inicial no puede ser mayor que el día final.";
  }
  return null;
}
