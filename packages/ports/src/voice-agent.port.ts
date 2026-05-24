import type { CallStatus } from "./types/call-status";
import type { StrategyContext } from "./types/strategy-context";

/**
 * Contrato con el servicio externo de agente de voz.
 * Implementación real fuera de alcance MVP core; usar {@link VoiceAgentStubAdapter}.
 */
export interface VoiceAgentPort {
  initiateCall(input: InitiateCallInput): Promise<InitiateCallResult>;
  getCallStatus(call_id: string): Promise<CallStatus>;
}

export interface InitiateCallInput {
  debt_id: string;
  debtor_phone: string;
  strategy_context: StrategyContext;
}

export interface InitiateCallResult {
  call_id: string;
  status: "queued" | "failed";
}
