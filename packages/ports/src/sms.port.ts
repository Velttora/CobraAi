/**
 * Contrato de envío SMS (implementación real vía Twilio en service-notifications).
 */
export interface SMSPort {
  sendSMS(input: SendSMSInput): Promise<SendSMSResult>;
}

export interface SendSMSInput {
  to: string;
  body: string;
  tenant_id: string;
}

export interface SendSMSResult {
  message_id: string;
  status: "sent" | "failed";
}
