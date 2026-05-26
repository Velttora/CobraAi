import { describe, expect, it } from "vitest";
import { parseFilters } from "./api.utils";

describe("parseFilters", () => {
  it("lee filtros anidados de Express qs (?filter[campo]=valor)", () => {
    expect(
      parseFilters({
        filter: {
          collection_quarter: "Q3-2026",
          portfolio_id: "pf_1"
        }
      })
    ).toEqual({
      collection_quarter: "Q3-2026",
      portfolio_id: "pf_1"
    });
  });

  it("lee filtros con clave plana filter[campo]", () => {
    expect(
      parseFilters({
        "filter[collection_quarter]": "Q2-2026"
      })
    ).toEqual({
      collection_quarter: "Q2-2026"
    });
  });

  it("prioriza claves planas si coexisten con anidadas", () => {
    expect(
      parseFilters({
        filter: { collection_quarter: "Q3-2026" },
        "filter[collection_quarter]": "Q4-2026"
      })
    ).toEqual({
      collection_quarter: "Q4-2026"
    });
  });
});
