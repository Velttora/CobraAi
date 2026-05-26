import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import type {
  VoiceAgentPort,
  InitiateCallInput,
  InitiateCallResult,
  CallStatus,
} from "@cobrai/ports";

interface VapiCallResponse {
  id: string;
  status: string;
}

/** Convierte número a texto en español para que Vapi lo lea correctamente.
 *  Ej: 1500000 → "un millón quinientos mil pesos colombianos"
 */
function montoEspanol(raw: string | number): string {
  const n = Math.round(Number(raw));
  if (isNaN(n)) return String(raw);

  const unidades = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const centenas = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos",
    "seiscientos", "setecientos", "ochocientos", "novecientos"];

  function cientos(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cien";
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const sc = c > 0 ? centenas[c] : "";
    if (resto === 0) return sc ?? "";
    if (resto < 20) return `${sc}${sc ? " " : ""}${unidades[resto]}`;
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    const sd = decenas[d];
    return `${sc}${sc ? " " : ""}${sd}${u > 0 ? ` y ${unidades[u]}` : ""}`;
  }

  if (n === 0) return "cero pesos colombianos";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1_000);
  const resto = n % 1_000;

  const parts: string[] = [];

  if (millones > 0) {
    parts.push(millones === 1 ? "un millón" : `${cientos(millones)} millones`);
  }
  if (miles > 0) {
    parts.push(miles === 1 ? "mil" : `${cientos(miles)} mil`);
  }
  if (resto > 0) {
    parts.push(cientos(resto));
  }

  return `${parts.join(" ")} pesos colombianos`;
}

@Injectable()
export class VapiVoiceAdapter implements VoiceAgentPort {
  private readonly logger = new Logger(VapiVoiceAdapter.name);
  private readonly baseUrl = "https://api.vapi.ai";
  private readonly apiKey: string;
  private readonly agentId: string;

  private readonly phoneNumberId: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.getOrThrow<string>("VAPI_API_KEY");
    this.agentId = config.getOrThrow<string>("VAPI_AGENT_ID");
    this.phoneNumberId = config.get<string>("VAPI_PHONE_NUMBER_ID");
  }

  async initiateCall(input: InitiateCallInput): Promise<InitiateCallResult> {
    const ctx = input.strategy_context;
    const phone = input.debtor_phone.startsWith("+")
      ? input.debtor_phone
      : `+${input.debtor_phone}`;

    try {
      const response = await axios.post<VapiCallResponse>(
        `${this.baseUrl}/call`,
        {
          assistantId: this.agentId,
          phoneNumberId: this.phoneNumberId,
          customer: {
            number: phone,
            name: ctx.variables["nombre"] ?? ctx.variables["debtor_name"],
          },
          assistantOverrides: {
            variableValues: {
              nombre: ctx.variables["nombre"] ?? "cliente",
              monto: montoEspanol(ctx.variables["monto"] ?? ctx.variables["amount"] ?? "0"),
              empresa: ctx.variables["empresa"] ?? "CobraAI",
              fecha_vencimiento: ctx.variables["due_date"] ?? "",
              // No pasar link_pago — se envía por WhatsApp al terminar la llamada
            },
          },
          metadata: {
            debt_id: input.debt_id,
            tenant_id: ctx.tenant_id,
            strategy_id: ctx.strategy_id,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      this.logger.log(
        `Llamada Vapi iniciada call_id=${response.data.id} → ${phone}`,
      );
      return { call_id: response.data.id, status: "queued" };
    } catch (err: unknown) {
      this.logger.error(`Vapi call fallida → ${phone}: ${String(err)}`);
      return { call_id: "", status: "failed" };
    }
  }

  async getCallStatus(call_id: string): Promise<CallStatus> {
    try {
      const response = await axios.get<VapiCallResponse>(
        `${this.baseUrl}/call/${call_id}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } },
      );
      const mapped = this.mapStatus(response.data.status);
      return { call_id, status: mapped };
    } catch {
      return { call_id, status: "queued" };
    }
  }

  private mapStatus(
    vapiStatus: string,
  ): "queued" | "ringing" | "in_progress" | "completed" | "failed" | "no_answer" | "busy" {
    switch (vapiStatus) {
      case "queued":
        return "queued";
      case "ringing":
        return "ringing";
      case "in-progress":
      case "in_progress":
        return "in_progress";
      case "ended":
        return "completed";
      case "failed":
        return "failed";
      case "no-answer":
      case "no_answer":
        return "no_answer";
      case "busy":
        return "busy";
      default:
        return "queued";
    }
  }
}
