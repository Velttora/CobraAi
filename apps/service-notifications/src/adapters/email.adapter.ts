import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type {
  EmailPort,
  SendEmailTemplateInput,
  SendEmailTemplateResult
} from "@cobrai/ports";

@Injectable()
export class EmailAdapter implements EmailPort {
  private readonly logger = new Logger(EmailAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendTemplate(
    input: SendEmailTemplateInput
  ): Promise<SendEmailTemplateResult> {
    const apiKey = this.config.get<string>("SENDGRID_API_KEY");
    const from = this.config.get<string>("SENDGRID_FROM_EMAIL") ?? "noreply@cobrai.dev";

    if (!apiKey) {
      this.logger.warn(
        `SendGrid sandbox: email simulado a ${input.to} (template ${input.template_id})`
      );
      return { message_id: randomUUID(), status: "sent" };
    }

    const subject = input.variables.subject ?? "Notificación CobraAI";
    const html = input.variables.body ?? Object.entries(input.variables)
      .map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`)
      .join("");

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }], dynamic_template_data: input.variables }],
        from: { email: from },
        subject,
        content: [{ type: "text/html", value: html }]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`SendGrid error ${response.status}: ${detail}`);
      return { message_id: randomUUID(), status: "failed" };
    }

    const messageId = response.headers.get("x-message-id") ?? randomUUID();
    return { message_id: messageId, status: "sent" };
  }
}
