import { randomUUID } from "node:crypto";
import type {
  SendWhatsAppTemplateInput,
  SendWhatsAppTemplateResult,
  WhatsAppPort
} from "../whatsapp.port";

const optedInPhones = new Set<string>();

/**
 * Stub local: simula envío y opt-in de WhatsApp para flujos E2E.
 */
export class WhatsAppStubAdapter implements WhatsAppPort {
  async sendTemplate(
    input: SendWhatsAppTemplateInput
  ): Promise<SendWhatsAppTemplateResult> {
    void input;
    return {
      message_id: randomUUID(),
      status: "sent"
    };
  }

  async isOptedIn(phone: string, tenant_id: string): Promise<boolean> {
    void tenant_id;
    return optedInPhones.has(phone) || phone.endsWith("0");
  }

  /** Helper de pruebas: registrar opt-in sintético. */
  registerOptIn(phone: string): void {
    optedInPhones.add(phone);
  }
}
