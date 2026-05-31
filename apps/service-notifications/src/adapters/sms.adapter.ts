import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { SMSPort, SendSMSInput, SendSMSResult } from "@cobrai/ports";
import { truncateSms } from "../common/utils/api.utils";

interface SinchBatchResponse {
  id: string;
  status: string;
}

@Injectable()
export class SmsAdapter implements SMSPort {
  private readonly logger = new Logger(SmsAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendSMS(input: SendSMSInput): Promise<SendSMSResult> {
    const servicePlanId = this.config.get<string>("SINCH_SERVICE_PLAN_ID");
    const apiToken = this.config.get<string>("SINCH_API_TOKEN");
    const from = this.config.get<string>("SINCH_FROM");
    const body = truncateSms(input.body);

    if (!servicePlanId || !apiToken || !from) {
      this.logger.warn(`Sinch sandbox: SMS simulado a ${input.to}`);
      return { message_id: randomUUID(), status: "sent" };
    }

    const to = input.to.startsWith("+") ? input.to.slice(1) : input.to;

    const response = await fetch(
      `https://api.sinch.com/xms/v1/${servicePlanId}/batches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from, to: [to], body })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Sinch error ${response.status}: ${detail}`);
      return { message_id: randomUUID(), status: "failed" };
    }

    const data = (await response.json()) as SinchBatchResponse;
    this.logger.log(`Sinch SMS enviado batch_id=${data.id} to=${input.to}`);
    return { message_id: data.id ?? randomUUID(), status: "sent" };
  }
}
