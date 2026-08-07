export type ServiceRoute = {
  prefix: string;
  envKey: string;
};

export const SERVICE_ROUTES: ServiceRoute[] = [
  { prefix: "/api/v1/portfolios", envKey: "SERVICE_PORTFOLIOS_URL" },
  { prefix: "/api/v1/debts", envKey: "SERVICE_PORTFOLIOS_URL" },
  { prefix: "/api/v1/debtors", envKey: "SERVICE_PORTFOLIOS_URL" },
  { prefix: "/api/v1/workflows", envKey: "SERVICE_WORKFLOWS_URL" },
  { prefix: "/api/v1/contacts", envKey: "SERVICE_NOTIFICATIONS_URL" },
  { prefix: "/api/v1/conversations", envKey: "SERVICE_NOTIFICATIONS_URL" },
  { prefix: "/api/v1/negotiations", envKey: "SERVICE_NOTIFICATIONS_URL" },
  { prefix: "/api/v1/templates", envKey: "SERVICE_NOTIFICATIONS_URL" },
  { prefix: "/api/v1/payments", envKey: "SERVICE_PAYMENTS_URL" },
  { prefix: "/api/v1/payment-links", envKey: "SERVICE_PAYMENTS_URL" },
  { prefix: "/api/v1/audit-logs", envKey: "SERVICE_PORTFOLIOS_URL" },
  // Settings > Integraciones (Phase 8, plan 08-14).
  { prefix: "/api/v1/integrations", envKey: "SERVICE_NOTIFICATIONS_URL" }
];

/**
 * Boot-time assertion that every route in the table has somewhere to proxy to.
 *
 * Without it a missing or misspelled variable is only discovered one request at
 * a time, as a 503 on whichever routes happen to use it — which reads like an
 * intermittent outage rather than a configuration error. `.env.example` carried
 * `SERVICE_WORKFOLIOS_URL` for exactly this reason, so every `/api/v1/workflows`
 * call 503'd for anyone who copied it, while the rest of the gateway looked fine.
 *
 * Names every missing variable at once rather than stopping at the first, so a
 * fresh environment is fixed in one pass.
 */
export function assertServiceRoutesConfigured(
  env: NodeJS.ProcessEnv = process.env,
  routes: ServiceRoute[] = SERVICE_ROUTES
): void {
  const missing = [...new Set(routes.map((r) => r.envKey))]
    .filter((key) => !env[key])
    .sort();

  if (missing.length > 0) {
    throw new Error(
      `El gateway no puede enrutar sin estas variables: ${missing.join(", ")}. ` +
        `Cada una apunta al microservicio de su prefijo; sin ellas esas rutas ` +
        `responden 503 y parece una caída intermitente en vez de configuración faltante.`
    );
  }
}
