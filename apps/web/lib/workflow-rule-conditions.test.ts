import { describe, expect, it } from "vitest";
import {
  applyAgingRangeToCondition,
  buildRuleCondition,
  parseAgingRangeFromCondition,
  showsAgingRangeField,
  validateAgingRangeForm
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
});

describe("showsAgingRangeField", () => {
  it("muestra rango para schedule y reglas legacy con aging_bucket", () => {
    expect(showsAgingRangeField("schedule")).toBe(true);
    expect(showsAgingRangeField("debt_created", { aging_bucket: "d0_30" })).toBe(
      true
    );
    expect(showsAgingRangeField("debt_created", { status: "new" })).toBe(false);
  });
});

describe("validateAgingRangeForm", () => {
  it("rechaza rango invertido", () => {
    expect(validateAgingRangeForm("60", "30")).toBe(
      "El día inicial no puede ser mayor que el día final."
    );
  });
});
