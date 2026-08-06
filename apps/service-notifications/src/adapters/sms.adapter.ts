import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { SMSPort, SendSMSInput, SendSMSResult } from "@cobrai/ports";
import { truncateSms } from "../common/utils/api.utils";
import { isSimulationEnabled } from "./simulation.guard";

interface BirdMessageResponse {
  id: string;
}

@Injectable()
export class SmsAdapter implements SMSPort {
  private readonly logger = new Logger(SmsAdapter.name);

  // SMS stays disabled by feature flag and out of BYO scope for this phase
  // (deferred, per 08-CONTEXT.md) — it keeps reading the platform-global Bird
  // key rather than resolving per-tenant credentials like the other channels.
  constructor(private readonly config: ConfigService) {}

  async sendSMS(input: SendSMSInput): Promise<SendSMSResult> {
    const apiKey = this.config.get<string>("BIRD_API_KEY");
    const originator = this.config.get<string>("BIRD_FROM") ?? "CobraAI";
    const body = truncateSms(input.body);

    if (!apiKey) {
      // D-17: a missing key is a real failure unless simulation is explicitly
      // enabled — the previous unconditional "sent" here was a phantom send.
      if (isSimulationEnabled()) {
        this.logger.warn(`Bird sandbox: SMS simulado a ${input.to}`);
        return { message_id: randomUUID(), status: "sent", simulated: true };
      }
      this.logger.error(`Bird sin BIRD_API_KEY configurado: SMS rechazado (to=${input.to})`);
      return { message_id: "", status: "failed" };
    }

    const response = await fetch("https://rest.messagebird.com/messages", {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        originator,
        recipients: [input.to],
        body
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Bird error ${response.status}: ${detail}`);
      return { message_id: randomUUID(), status: "failed" };
    }

    const data = (await response.json()) as BirdMessageResponse;
    this.logger.log(`Bird SMS enviado id=${data.id} to=${input.to}`);
    return { message_id: data.id ?? randomUUID(), status: "sent" };
  }
}
