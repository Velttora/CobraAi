import { randomUUID } from "node:crypto";
import type { CallStatus } from "../types/call-status";
import type {
  InitiateCallInput,
  InitiateCallResult,
  VoiceAgentPort
} from "../voice-agent.port";

const callStore = new Map<string, CallStatus>();

/**
 * Stub local: encola llamadas sintéticas para desarrollo sin servicio de voz.
 */
export class VoiceAgentStubAdapter implements VoiceAgentPort {
  async initiateCall(input: InitiateCallInput): Promise<InitiateCallResult> {
    const call_id = randomUUID();
    callStore.set(call_id, {
      call_id,
      status: "queued"
    });
    void input;
    return { call_id, status: "queued" };
  }

  async getCallStatus(call_id: string): Promise<CallStatus> {
    const existing = callStore.get(call_id);
    if (existing) {
      return { ...existing, status: "completed", duration_seconds: 45 };
    }
    return {
      call_id,
      status: "failed",
      failure_reason: "call_not_found"
    };
  }
}
