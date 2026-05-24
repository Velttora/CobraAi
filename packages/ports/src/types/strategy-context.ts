import type { ContactChannel, RiskSegment } from "./risk-segment";

/**
 * Contexto de estrategia de cobranza pasado al agente de voz u otros canales.
 */
export interface StrategyContext {
  tenant_id: string;
  strategy_id: string;
  template_id?: string;
  language: string;
  segment: RiskSegment;
  preferred_channel: ContactChannel;
  variables: Record<string, string>;
  max_attempts?: number;
}
