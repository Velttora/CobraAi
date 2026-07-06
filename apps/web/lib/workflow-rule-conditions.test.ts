import { describe, expect, it } from "vitest";
import {
  applyAgingRangeToCondition,
  applyPreDueRangeToCondition,
  buildRuleCondition,
  conditionTargetsPreDue,
  parseAgingRangeFromCondition,
  parseDaysToDueRangeFromCondition,
  showsAgingRangeField,
  showsPreDueRangeField,
  validateAgingRangeForm,
  validatePreDueRangeForm
} from "./workflow-rule-conditions";

describe("parseAgingRangeFromCondition", () => {
  it("lee aging_days parametrizado", () => {
    expect(
      parseAgingRangeFromCondition({ aging_days: { gte: 31, lte: 60 } })
    ).toEqual({ min: 31, max: 60 });
  });

  it("migra aging_bucket legacy a rango por defecto", () => {
    expect(parseAgingRangeFromCondition({ aging_bucket: "d31_60" })).toEqual({
      min: 31,
      max: 60
    });
  });

  it("lee solo gte para mora indefinida", () => {
    expect(parseAgingRangeFromCondition({ aging_days: { gte: 181 } })).toEqual({
      min: 181,
      max: undefined
    });
  });
});

describe("parseDaysToDueRangeFromCondition", () => {
  it("lee days_to_due para pre-vencimiento", () => {
    expect(
      parseDaysToDueRangeFromCondition({ days_to_due: { gte: 1, lte: 7 } })
    ).toEqual({ min: 1, max: 7 });
  });
});

describe("buildRuleCondition", () => {
  it("preserva condiciones extra al editar rango", () => {
    expect(
      buildRuleCondition({
        trigger: "schedule",
        agingMinDays: "45",
        agingMaxDays: "90",
        existing: {
          whatsapp_opt_in: true,
          __source_package: "pyme_fintech"
        }
      })
    ).toEqual({
      whatsapp_opt_in: true,
      __source_package: "pyme_fintech",
      aging_days: { gte: 45, lte: 90 }
    });
  });

  it("elimina aging_bucket al guardar rango nuevo", () => {
    expect(
      applyAgingRangeToCondition(
        { aging_bucket: "d0_30", whatsapp_opt_in: true },
        { min: 0, max: 45 }
      )
    ).toEqual({
      whatsapp_opt_in: true,
      aging_days: { gte: 0, lte: 45 }
    });
  });
  it("preserva condiciones extra al editar pre-vencimiento", () => {
    expect(
      buildRuleCondition({
        trigger: "schedule",
        agingMinDays: "1",
        agingMaxDays: "14",
        existing: {
          days_to_due: { gte: 1, lte: 7 },
          whatsapp_opt_in: true
        }
      })
    ).toEqual({
      whatsapp_opt_in: true,
      days_to_due: { gte: 1, lte: 14 }
    });
  });

  it("elimina aging_days al guardar pre-vencimiento", () => {
    expect(
      applyPreDueRangeToCondition(
        { aging_days: { gte: 0, lte: 30 }, whatsapp_opt_in: true },
        { min: 1, max: 7 }
      )
    ).toEqual({
      whatsapp_opt_in: true,
      days_to_due: { gte: 1, lte: 7 }
    });
  });
});

describe("showsAgingRangeField", () => {
  it("muestra rango para schedule y reglas legacy con aging_bucket", () => {
    expect(showsAgingRangeField("schedule")).toBe(true);
    expect(showsAgingRangeField("debt_created", { aging_bucket: "d0_30" })).toBe(
      true
    );
    expect(showsAgingRangeField("debt_created", { status: "new" })).toBe(false);
  });

  it("oculta mora cuando la regla es pre-vencimiento", () => {
    expect(
      showsAgingRangeField("schedule", { days_to_due: { gte: 1, lte: 7 } })
    ).toBe(false);
    expect(conditionTargetsPreDue({ days_to_due: { gte: 1, lte: 7 } })).toBe(
      true
    );
    expect(
      showsPreDueRangeField("schedule", { days_to_due: { gte: 1, lte: 7 } })
    ).toBe(true);
  });
});

describe("validatePreDueRangeForm", () => {
  it("rechaza rango invertido", () => {
    expect(validatePreDueRangeForm("7", "1")).toBe(
      "El mínimo de días antes no puede ser mayor que el máximo."
    );
  });
});

describe("validateAgingRangeForm", () => {
  it("rechaza rango invertido", () => {
    expect(validateAgingRangeForm("60", "30")).toBe(
      "El día inicial no puede ser mayor que el día final."
    );
  });
});
