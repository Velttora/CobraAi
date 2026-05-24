/**
 * Contrato con el servicio externo de WhatsApp Business.
 * Implementación real fuera de alcance MVP core; usar {@link WhatsAppStubAdapter}.
 */
export interface WhatsAppPort {
  sendTemplate(input: SendWhatsAppTemplateInput): Promise<SendWhatsAppTemplateResult>;
  isOptedIn(phone: string, tenant_id: string): Promise<boolean>;
}

export interface SendWhatsAppTemplateInput {
  to: string;
  template_id: string;
  variables: Record<string, string>;
  tenant_id: string;
}

export interface SendWhatsAppTemplateResult {
  message_id: string;
  status: "sent" | "failed";
}
