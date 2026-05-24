/**
 * Contrato de envío de correo (implementación real vía SendGrid en service-notifications).
 */
export interface EmailPort {
  sendTemplate(input: SendEmailTemplateInput): Promise<SendEmailTemplateResult>;
}

export interface SendEmailTemplateInput {
  to: string;
  template_id: string;
  variables: Record<string, string>;
  tenant_id: string;
  reply_to?: string;
}

export interface SendEmailTemplateResult {
  message_id: string;
  status: "sent" | "failed";
}
