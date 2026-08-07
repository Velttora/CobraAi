import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  EmailPort,
  SendEmailTemplateInput,
  SendEmailTemplateResult
} from "@cobrai/ports";
import { ConfigService } from "@nestjs/config";
import { TenantIntegrationService } from "@cobrai/integrations";
import { isSimulationEnabled } from "./simulation.guard";

@Injectable()
export class EmailAdapter implements EmailPort {
  private readonly logger = new Logger(EmailAdapter.name);

  constructor(
    private readonly integrations: TenantIntegrationService,
    private readonly config: ConfigService
  ) {}

  async sendTemplate(
    input: SendEmailTemplateInput
  ): Promise<SendEmailTemplateResult> {
    const integration = await this.integrations.resolveByChannel(input.tenant_id, "email");

    if (!integration) {
      // D-17: the previous unconditional "simulate and report success" behaviour
      // here is exactly the phantom-send pattern this plan removes — under BYO,
      // a missing tenant credential must be a real failure unless simulation is
      // explicitly enabled.
      if (isSimulationEnabled()) {
        this.logger.warn(
          `SendGrid sandbox: email simulado a ${input.to} (template ${input.template_id}, tenant ${input.tenant_id})`
        );
        return { message_id: randomUUID(), status: "sent", simulated: true };
      }
      this.logger.error(
        `Sin integración de SendGrid verificada para tenant ${input.tenant_id}: envío rechazado (to=${input.to})`
      );
      return { message_id: "", status: "failed" };
    }

    // In shared-sending mode there is no per-tenant subuser and therefore no
    // scoped key, so the platform's parent key does the sending. It is read
    // from the environment rather than copied into every tenant row: one
    // leaked row must not expose the credential that governs all of them.
    const sharedSending = integration.publicConfig.sharedSendingAccount === "true";
    const apiKey = sharedSending
      ? this.config.get<string>("SENDGRID_PARENT_API_KEY")
      : integration.secrets.apiKey;

    if (!apiKey) {
      this.logger.error(
        `Email sin llave utilizable para tenant ${input.tenant_id}` +
          (sharedSending ? " (modo compartido, falta SENDGRID_PARENT_API_KEY)" : "")
      );
      return { message_id: "", status: "failed" };
    }
    const fromEmail = integration.publicConfig.fromEmail ?? "noreply@cobrai.dev";
    const fromName = integration.publicConfig.fromName;
    // D-22: Reply-To is always the tenant's own domain, never the platform's
    // shared one. Without a tenant-configured domain there is no inbound reply
    // loop, only outbound (the documented degraded state) — the key must be
    // entirely absent, not present-but-undefined, because SendGrid v3 rejects
    // `reply_to: undefined`. An explicit `input.reply_to` (e.g. the agent
    // replying inside an existing thread) still takes precedence.
    const replyDomain = integration.publicConfig.replyDomain;
    const replyTo = input.reply_to ?? (replyDomain ? `reply@${replyDomain}` : undefined);

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
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: fromEmail, ...(fromName ? { name: fromName } : {}) },
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
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
