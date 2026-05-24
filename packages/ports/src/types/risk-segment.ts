/** Nivel de riesgo o segmentación usado por scoring y estrategias. */
export type RiskSegment = "critical" | "high" | "medium" | "low" | "minimal";

export type ContactChannel =
  | "whatsapp"
  | "voice"
  | "email"
  | "sms"
  | "portal";
