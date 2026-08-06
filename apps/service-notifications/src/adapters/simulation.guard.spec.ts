import { describe, expect, it } from "vitest";
import { assertSimulationNotInProduction, isSimulationEnabled } from "./simulation.guard";

describe("isSimulationEnabled", () => {
  it("SIMULATE_OUTBOUND_SENDS=true → true", () => {
    expect(isSimulationEnabled({ SIMULATE_OUTBOUND_SENDS: "true" })).toBe(true);
  });

  it("valor no seteado → false", () => {
    expect(isSimulationEnabled({})).toBe(false);
  });

  it('"1" → false (solo el string exacto "true" habilita)', () => {
    expect(isSimulationEnabled({ SIMULATE_OUTBOUND_SENDS: "1" })).toBe(false);
  });

  it('"yes" → false', () => {
    expect(isSimulationEnabled({ SIMULATE_OUTBOUND_SENDS: "yes" })).toBe(false);
  });

  it('"TRUE" (mayúsculas) → false', () => {
    expect(isSimulationEnabled({ SIMULATE_OUTBOUND_SENDS: "TRUE" })).toBe(false);
  });
});

describe("assertSimulationNotInProduction", () => {
  it("SIMULATE_OUTBOUND_SENDS=true + NODE_ENV=production → lanza, nombrando ambas variables", () => {
    expect(() =>
      assertSimulationNotInProduction({
        SIMULATE_OUTBOUND_SENDS: "true",
        NODE_ENV: "production"
      })
    ).toThrow(/SIMULATE_OUTBOUND_SENDS/);
    expect(() =>
      assertSimulationNotInProduction({
        SIMULATE_OUTBOUND_SENDS: "true",
        NODE_ENV: "production"
      })
    ).toThrow(/NODE_ENV/);
  });

  it("SIMULATE_OUTBOUND_SENDS=true + NODE_ENV=development → no lanza", () => {
    expect(() =>
      assertSimulationNotInProduction({
        SIMULATE_OUTBOUND_SENDS: "true",
        NODE_ENV: "development"
      })
    ).not.toThrow();
  });

  it("flag sin setear + NODE_ENV=production → no lanza", () => {
    expect(() => assertSimulationNotInProduction({ NODE_ENV: "production" })).not.toThrow();
  });
});
