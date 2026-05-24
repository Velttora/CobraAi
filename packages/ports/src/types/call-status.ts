/**
 * Estado de una llamada gestionada por el servicio externo de voz.
 */
export type CallStatusValue =
  | "queued"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "busy";

export interface CallStatus {
  call_id: string;
  status: CallStatusValue;
  duration_seconds?: number;
  recording_url?: string;
  ended_at?: string;
  failure_reason?: string;
}
