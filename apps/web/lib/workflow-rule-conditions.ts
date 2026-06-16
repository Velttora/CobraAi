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

function readBound(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

export function showsAgingRangeField(
  trigger: string | undefined,
  condition?: Record<string, unknown>
): boolean {
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
