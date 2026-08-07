import { describe, expect, it } from "vitest";
import { SERVICE_ROUTES, assertServiceRoutesConfigured } from "./service-routes";

const ALL_KEYS = [...new Set(SERVICE_ROUTES.map((r) => r.envKey))];

function envWithAll(): NodeJS.ProcessEnv {
  return Object.fromEntries(ALL_KEYS.map((k) => [k, "http://localhost:1234"]));
}

describe("assertServiceRoutesConfigured", () => {
  it("pasa cuando toda ruta tiene su URL", () => {
    expect(() => assertServiceRoutesConfigured(envWithAll())).not.toThrow();
  });

  // El caso real: `.env.example` traía `SERVICE_WORKFOLIOS_URL` mal escrito, así
  // que quien lo copiara veía 503 en cada llamada a /api/v1/workflows mientras
  // el resto del gateway funcionaba — se siente como una caída intermitente.
  it("falla nombrando la variable que falta", () => {
    const env = envWithAll();
    delete env.SERVICE_WORKFLOWS_URL;

    expect(() => assertServiceRoutesConfigured(env)).toThrow(/SERVICE_WORKFLOWS_URL/);
  });

  it("nombra todas las que faltan de una vez, no solo la primera", () => {
    const env = envWithAll();
    delete env.SERVICE_WORKFLOWS_URL;
    delete env.SERVICE_PAYMENTS_URL;

    try {
      assertServiceRoutesConfigured(env);
      expect.unreachable("debió lanzar");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("SERVICE_PAYMENTS_URL");
      expect(message).toContain("SERVICE_WORKFLOWS_URL");
    }
  });

  it("toda ruta declarada apunta a una variable, sin prefijos huérfanos", () => {
    for (const route of SERVICE_ROUTES) {
      expect(route.envKey).toMatch(/^SERVICE_[A-Z_]+_URL$/);
      expect(route.prefix.startsWith("/api/v1/")).toBe(true);
    }
  });
});
