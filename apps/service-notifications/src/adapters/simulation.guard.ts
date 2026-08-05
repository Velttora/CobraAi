/**
 * Single source of truth for whether simulated ("phantom") sends are permitted
 * (D-17). Every adapter's "no credential, simulate anyway" branch must call
 * this instead of re-implementing its own env check, so there is exactly one
 * place that decides.
 *
 * Only the exact string "true" enables simulation — "1", "yes", "TRUE" and an
 * unset value are all false, since a typo here must never accidentally turn
 * simulation on.
 */
export function isSimulationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SIMULATE_OUTBOUND_SENDS === "true";
}

/**
 * Boot-time assertion, called before `NestFactory.create` in `main.ts`. A
 * per-call check would let the process start and only fail once a debtor was
 * already miscounted as contacted — a phantom send under BYO would inflate
 * delivery metrics and consume the Ley 1266 contact quota for a contact that
 * never actually happened (RESEARCH.md Pitfall 3). Failing at boot means a
 * misconfigured production deploy never sends a single phantom message.
 */
export function assertSimulationNotInProduction(env: NodeJS.ProcessEnv = process.env): void {
  if (isSimulationEnabled(env) && env.NODE_ENV === "production") {
    throw new Error(
      "SIMULATE_OUTBOUND_SENDS=true no puede estar activo con NODE_ENV=production: " +
        "los envíos simulados inflarían métricas de entrega y consumirían el cupo de " +
        "contacto de la Ley 1266 para contactos que nunca ocurrieron de verdad."
    );
  }
}
