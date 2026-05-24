export type {
  AIScoringPort,
  DebtFeatures,
  ScoreDebtInput,
  ScoringResult
} from "./ai-scoring.port";
export type {
  EmailPort,
  SendEmailTemplateInput,
  SendEmailTemplateResult
} from "./email.port";
export type {
  SendSMSInput,
  SendSMSResult,
  SMSPort
} from "./sms.port";
export type { CallStatus, CallStatusValue } from "./types/call-status";
export type { ContactChannel, RiskSegment } from "./types/risk-segment";
export type { StrategyContext } from "./types/strategy-context";
export type {
  InitiateCallInput,
  InitiateCallResult,
  VoiceAgentPort
} from "./voice-agent.port";
export type {
  SendWhatsAppTemplateInput,
  SendWhatsAppTemplateResult,
  WhatsAppPort
} from "./whatsapp.port";

export { AIScoringStubAdapter } from "./stubs/ai-scoring.stub";
export { VoiceAgentStubAdapter } from "./stubs/voice-agent.stub";
export { WhatsAppStubAdapter } from "./stubs/whatsapp.stub";
