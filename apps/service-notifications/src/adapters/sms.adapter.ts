import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { SMSPort, SendSMSInput, SendSMSResult } from "@cobrai/ports";
import { truncateSms } from "../common/utils/api.utils";

interface BirdMessageResponse {
  id: string;
}

@Injectable()
export class SmsAdapter implements SMSPort {
  private readonly logger = new Logger(SmsAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendSMS(input: SendSMSInput): Promise<SendSMSResult> {
    const apiKey = this.config.get<string>("BIRD_API_KEY");
    const originator = this.config.get<string>("BIRD_FROM") ?? "CobraAI";
    const body = truncateSms(input.body);

    if (!apiKey) {
      this.logger.warn(`Bird sandbox: SMS simulado a ${input.to}`);
      return { message_id: randomUUID(), status: "sent" };
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
