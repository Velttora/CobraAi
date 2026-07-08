import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { PrismaService } from "@cobrai/db";
import { Prisma } from "@cobrai/db";
import type { DebtorHistory, PendingDebtSummary } from "../agent/prompts/cobrai-system.prompt";

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface PendingDebt {
  debtId: string;
  externalRef: string | null;
  amountOutstanding: number;
  currency: string;
  dueDate: string; // YYYY-MM-DD
}

export interface EmotionalProfile {
  summary: string;
  sentiment: "positivo" | "neutral" | "negativo" | "hostil";
  lastIntent: string;
  paymentBehavior: "cumplidor" | "moroso" | "evasivo" | "desconocido";
  sentimentScore: number; // -1.0 to 1.0
  updatedAt: string;      // ISO string
  interactionCount: number;
  pendingDebts?: PendingDebt[];
}

export interface UnifiedDebtorContext {
  debtorHistory: DebtorHistory;
  emotionalProfile: EmotionalProfile | null;
}

// ---------------------------------------------------------------------------
// Internal analysis result shape (subset of EmotionalProfile, without metadata)
// ---------------------------------------------------------------------------
interface AnalysisResult {
  sentiment: EmotionalProfile["sentiment"];
  sentimentScore: number;
  lastIntent: string;
  paymentBehavior: EmotionalProfile["paymentBehavior"];
  summary: string;
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse Debtor.emotionalProfile (Json?) into EmotionalProfile.
 * Tolerates non-object inputs (Landmine 3).
 */
export function parseProfile(raw: unknown): EmotionalProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const pendingDebts = Array.isArray(p["pendingDebts"])
    ? (p["pendingDebts"] as PendingDebt[])
    : undefined;
  return {
    summary: String(p["summary"] ?? ""),
    sentiment: (p["sentiment"] as EmotionalProfile["sentiment"]) ?? "neutral",
    lastIntent: String(p["lastIntent"] ?? "otro"),
    paymentBehavior:
      (p["paymentBehavior"] as EmotionalProfile["paymentBehavior"]) ??
      "desconocido",
    sentimentScore:
      typeof p["sentimentScore"] === "number" ? p["sentimentScore"] : 0,
    updatedAt: String(p["updatedAt"] ?? new Date().toISOString()),
    interactionCount:
      typeof p["interactionCount"] === "number" ? p["interactionCount"] : 0,
    ...(pendingDebts ? { pendingDebts } : {})
  };
}

/**
 * Heuristic fallback when OpenAI is unavailable or fails (Landmine 6).
 */
function buildHeuristicProfile(
  contactCount: number,
  brokenCount: number,
  previousProfile: EmotionalProfile | null
): AnalysisResult {
  const behavior: EmotionalProfile["paymentBehavior"] =
    brokenCount > 1 ? "moroso" : brokenCount === 1 ? "evasivo" : "desconocido";
  return {
    sentiment: "neutral",
    sentimentScore: 0,
    lastIntent: "otro",
    paymentBehavior: behavior,
    summary:
      previousProfile?.summary ??
      `Deudor con ${contactCount} contacto(s) previo(s).`
  };
}

/**
 * Build the Spanish analysis prompt that asks for a single JSON object.
 */
function buildAnalysisPrompt(
  interactionText: string,
  previousSummary: string | null,
  contactCount: number,
  brokenPromisesCount: number,
  hasPendingPromise: boolean
): string {
  const context = previousSummary
    ? `RESUMEN PREVIO DEL DEUDOR:\n"${previousSummary.substring(0, 500)}"\n\n`
    : "PRIMER CONTACTO CON ESTE DEUDOR.\n\n";

  return `Eres un analizador de interacciones de cobranza en Colombia (Ley 1266).
Analiza la siguiente interacción y el historial previo, y produce un JSON con tu análisis.

${context}DATOS DE CONTEXTO:
- Contactos previos totales: ${contactCount}
- Promesas incumplidas: ${brokenPromisesCount}
- Tiene promesa pendiente: ${hasPendingPromise ? "sí" : "no"}

NUEVA INTERACCIÓN:
${interactionText.substring(0, 800)}

RESPONDE ÚNICAMENTE con este JSON (sin texto adicional):
{
  "sentiment": "positivo" | "neutral" | "negativo" | "hostil",
  "sentimentScore": número entre -1.0 (hostil) y 1.0 (positivo),
  "lastIntent": "promesa_pago" | "disputa" | "pago_confirmado" | "evasion" | "sin_compromiso" | "otro",
  "paymentBehavior": "cumplidor" | "moroso" | "evasivo" | "desconocido",
  "summary": "Resumen narrativo en español del historial completo del deudor, máximo 200 palabras. Incluye: actitud general, compromisos hechos/rotos, preferencias expresadas, señales de pago."
}`;
}

// ---------------------------------------------------------------------------
// Annotated message for cross-channel flattening
// ---------------------------------------------------------------------------
interface AnnotatedMessage {
  id: string;
  direction: string;
  channel: string;
  content: string;
  sentAt: Date | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DebtorMemoryService {
  private readonly logger = new Logger(DebtorMemoryService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    const apiKey = config.get<string>("OPENAI_API_KEY");
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.openai) {
      this.logger.warn(
        "OPENAI_API_KEY no configurada: DebtorMemoryService en modo fallback heurístico"
      );
    }
    this.model = config.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini";
  }

  // -------------------------------------------------------------------------
  // Public: getUnifiedContext (read-only, no LLM)
  // -------------------------------------------------------------------------

  async getUnifiedContext(
    tenantId: string,
    debtorId: string,
    debtId?: string
  ): Promise<UnifiedDebtorContext> {
    const { baseHistory, rawProfile } = await this.gatherContextData(
      tenantId,
      debtorId,
      debtId
    );

    const profile = rawProfile !== undefined ? parseProfile(rawProfile) : null;

    const debtorHistory: DebtorHistory = {
      ...baseHistory,
      livingSummary: profile?.summary ?? null,
      overallSentiment: profile?.sentiment ?? null,
      paymentBehavior: profile?.paymentBehavior ?? null,
      pendingDebts: (profile?.pendingDebts ?? []).map<PendingDebtSummary>((d) => ({
        externalRef: d.externalRef,
        amountStr: `$${d.amountOutstanding.toLocaleString("es-CO")} ${d.currency}`,
        dueDate: d.dueDate
      }))
    };

    return { debtorHistory, emotionalProfile: profile };
  }

  // -------------------------------------------------------------------------
  // Public: refreshMemory (gather → analyze → summarize → persist)
  // -------------------------------------------------------------------------

  async refreshMemory(
    tenantId: string,
    debtorId: string,
    contactId?: string
  ): Promise<void> {
    // 1. Read existing profile
    const debtorRow = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
      select: { emotionalProfile: true }
    });
    const previousProfile = debtorRow
      ? parseProfile(debtorRow.emotionalProfile)
      : null;

    // 2. Gather raw history
    const { messages, contacts, brokenCount, pendingPromise } =
      await this.gatherRawHistory(tenantId, debtorId);

    // 3. Build interaction text from messages
    const interactionText = this.buildInteractionText(messages);

    // 4. Analyze (LLM or heuristic)
    const analysis = await this.analyzeAndSummarize(
      interactionText,
      previousProfile,
      contacts.length,
      brokenCount,
      !!pendingPromise
    );

    // 5. Merge into updated profile — preserve pendingDebts across LLM rewrites
    const updated: EmotionalProfile = {
      ...analysis,
      interactionCount: (previousProfile?.interactionCount ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      ...(previousProfile?.pendingDebts ? { pendingDebts: previousProfile.pendingDebts } : {})
    };

    // 6. Persist debtor.emotionalProfile
    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: { emotionalProfile: updated as unknown as Prisma.InputJsonValue }
    });

    // 7. Persist contact.sentimentScore if contactId provided (Landmine 7)
    if (contactId) {
      await this.prisma.contact.update({
        where: { id: contactId },
        data: { sentimentScore: updated.sentimentScore }
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private: gatherContextData (for getUnifiedContext — read debtor row too)
  // -------------------------------------------------------------------------

  private async gatherContextData(
    tenantId: string,
    debtorId: string,
    debtId?: string
  ): Promise<{
    baseHistory: Omit<DebtorHistory, "livingSummary" | "overallSentiment" | "paymentBehavior" | "pendingDebts">;
    rawProfile: unknown;
  }> {
    const now = new Date();

    // Fetch debtor (for emotionalProfile)
    const debtorRow = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
      select: { emotionalProfile: true }
    });

    // Fetch contacts (all channels)
    const contacts = await this.prisma.contact.findMany({
      where: { debtorId, tenantId, deletedAt: null, status: "completed" },
      orderBy: { endedAt: "desc" },
      take: 10,
      select: {
        id: true,
        channel: true,
        outcome: true,
        endedAt: true,
        sentimentScore: true
      }
    });

    const lastContact = contacts[0];
    const lastContactDaysAgo = lastContact?.endedAt
      ? Math.floor(
          (now.getTime() - new Date(lastContact.endedAt).getTime()) / 86400000
        )
      : null;

    // Broken promises count
    const brokenCount = await this.prisma.promiseToPay.count({
      where: debtId
        ? { debtId, tenantId, status: "broken", deletedAt: null }
        : { tenantId, status: "broken", deletedAt: null, debt: { debtorId } }
    });

    // Pending promise
    const pendingPromise = await this.prisma.promiseToPay.findFirst({
      where: debtId
        ? { debtId, tenantId, status: "pending", deletedAt: null }
        : { tenantId, status: "pending", deletedAt: null, debt: { debtorId } },
      orderBy: { promisedDate: "asc" }
    });

    // Last voice message callSummary
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId, debtorId, deletedAt: null, channel: "voice" },
      orderBy: { lastMessageAt: "desc" },
      take: 3,
      include: {
        messages: {
          where: { deletedAt: null, direction: "out" },
          orderBy: { sentAt: "desc" },
          take: 1
        }
      }
    });

    let callSummary: string | null = null;
    const lastVoiceMsg = conversations.flatMap((c) => c.messages)[0];
    if (lastVoiceMsg) {
      try {
        const parsed = JSON.parse(lastVoiceMsg.content) as Record<
          string,
          unknown
        >;
        callSummary =
          String(parsed["summary"] ?? "").substring(0, 300) || null;
      } catch {
        /* ignore parse errors */
      }
    }

    const baseHistory = {
      previousContactsCount: contacts.length,
      brokenPromisesCount: brokenCount,
      lastOutcome: lastContact?.outcome ?? null,
      lastContactDaysAgo,
      preferredChannel:
        contacts.find((c) => c.outcome === "promise_made")?.channel ?? null,
      callSummary,
      hasPromisePending: !!pendingPromise,
      promisedDate: pendingPromise
        ? new Date(pendingPromise.promisedDate).toLocaleDateString("es-CO")
        : null
    };

    return { baseHistory, rawProfile: debtorRow?.emotionalProfile ?? null };
  }

  // -------------------------------------------------------------------------
  // Private: gatherRawHistory (for refreshMemory — cross-channel messages)
  // -------------------------------------------------------------------------

  private async gatherRawHistory(
    tenantId: string,
    debtorId: string,
    debtId?: string
  ): Promise<{
    messages: AnnotatedMessage[];
    contacts: Array<{ id: string; channel: string; outcome: string | null; endedAt: Date | null; sentimentScore: number | null }>;
    brokenCount: number;
    pendingPromise: { promisedDate: Date } | null;
  }> {
    // Cross-channel conversations + messages (N+1 safe via nested include)
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId, debtorId, deletedAt: null },
      orderBy: { lastMessageAt: "desc" },
      take: 10,
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { sentAt: "desc" },
          take: 10
        }
      }
    });

    // Flatten + annotate channel + sort chronologically
    const messages: AnnotatedMessage[] = conversations
      .flatMap((c) =>
        c.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          channel: c.channel,
          content: m.content,
          sentAt: m.sentAt
        }))
      )
      .sort(
        (a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0)
      );

    // Contacts (all channels)
    const contacts = await this.prisma.contact.findMany({
      where: { debtorId, tenantId, deletedAt: null, status: "completed" },
      orderBy: { endedAt: "desc" },
      take: 10,
      select: {
        id: true,
        channel: true,
        outcome: true,
        endedAt: true,
        sentimentScore: true
      }
    });

    // Broken promises
    const brokenCount = await this.prisma.promiseToPay.count({
      where: debtId
        ? { debtId, tenantId, status: "broken", deletedAt: null }
        : { tenantId, status: "broken", deletedAt: null, debt: { debtorId } }
    });

    // Pending promise
    const pendingPromise = await this.prisma.promiseToPay.findFirst({
      where: debtId
        ? { debtId, tenantId, status: "pending", deletedAt: null }
        : { tenantId, status: "pending", deletedAt: null, debt: { debtorId } },
      orderBy: { promisedDate: "asc" }
    });

    return { messages, contacts, brokenCount, pendingPromise };
  }

  // -------------------------------------------------------------------------
  // Private: buildInteractionText
  // -------------------------------------------------------------------------

  private buildInteractionText(messages: AnnotatedMessage[]): string {
    const parts: string[] = [];
    let totalChars = 0;
    const MAX = 800;

    // Process most recent messages first (already sorted chronologically, iterate from end)
    for (let i = messages.length - 1; i >= 0 && totalChars < MAX; i--) {
      const m = messages[i];
      if (!m) continue;

      let text: string;
      if (m.channel === "voice") {
        // Voice: prefer summary then transcript (Test H)
        try {
          const parsed = JSON.parse(m.content) as Record<string, unknown>;
          text = String(
            parsed["summary"] ?? parsed["transcript"] ?? m.content
          ).substring(0, 500);
        } catch {
          text = m.content.substring(0, 500);
        }
      } else {
        // WhatsApp / other text channels: inbound messages only (debtor's words)
        if (m.direction !== "in") continue;
        try {
          const parsed = JSON.parse(m.content) as Record<string, unknown>;
          text = String(
            parsed["text"] ?? parsed["body"] ?? m.content
          ).substring(0, 500);
        } catch {
          text = m.content.substring(0, 500);
        }
      }

      if (text) {
        parts.unshift(`[${m.channel}] ${text}`);
        totalChars += text.length;
      }

      if (parts.length >= 5) break;
    }

    return parts.join("\n").substring(0, MAX);
  }

  // -------------------------------------------------------------------------
  // Public: registerPendingDebt — called when a contact is blocked by awaiting_response/retry_cooldown
  // -------------------------------------------------------------------------

  async registerPendingDebt(
    tenantId: string,
    debtorId: string,
    debt: PendingDebt
  ): Promise<void> {
    const row = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
      select: { emotionalProfile: true }
    });
    const profile = parseProfile(row?.emotionalProfile) ?? {
      summary: "",
      sentiment: "neutral" as const,
      lastIntent: "otro",
      paymentBehavior: "desconocido" as const,
      sentimentScore: 0,
      updatedAt: new Date().toISOString(),
      interactionCount: 0
    };

    const existing = profile.pendingDebts ?? [];
    if (existing.some((d) => d.debtId === debt.debtId)) return;

    const updated: EmotionalProfile = {
      ...profile,
      pendingDebts: [...existing, debt]
    };

    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: { emotionalProfile: updated as unknown as Prisma.InputJsonValue }
    });

    this.logger.log(
      `Deuda ${debt.externalRef ?? debt.debtId} registrada como pendiente para deudor ${debtorId}`
    );
  }

  // -------------------------------------------------------------------------
  // Public: clearPendingDebts — called after a successful outbound contact
  // -------------------------------------------------------------------------

  async clearPendingDebts(tenantId: string, debtorId: string): Promise<void> {
    const row = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
      select: { emotionalProfile: true }
    });
    const profile = parseProfile(row?.emotionalProfile);
    if (!profile?.pendingDebts?.length) return;

    const updated: EmotionalProfile = { ...profile, pendingDebts: [] };
    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: { emotionalProfile: updated as unknown as Prisma.InputJsonValue }
    });
  }

  // -------------------------------------------------------------------------
  // Private: analyzeAndSummarize (LLM or heuristic)
  // -------------------------------------------------------------------------

  private async analyzeAndSummarize(
    interactionText: string,
    previousProfile: EmotionalProfile | null,
    contactCount: number,
    brokenCount: number,
    hasPending: boolean
  ): Promise<AnalysisResult> {
    if (!this.openai) {
      return buildHeuristicProfile(contactCount, brokenCount, previousProfile);
    }

    const prompt = buildAnalysisPrompt(
      interactionText,
      previousProfile?.summary ?? null,
      contactCount,
      brokenCount,
      hasPending
    );

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "Eres un analizador de cobranza. Responde ÚNICAMENTE con el JSON solicitado."
          },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
        temperature: 0.3
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as Partial<AnalysisResult>;

      return {
        sentiment: parsed.sentiment ?? "neutral",
        sentimentScore:
          typeof parsed.sentimentScore === "number"
            ? Math.max(-1, Math.min(1, parsed.sentimentScore))
            : 0,
        lastIntent: parsed.lastIntent ?? "otro",
        paymentBehavior: parsed.paymentBehavior ?? "desconocido",
        summary: parsed.summary ?? previousProfile?.summary ?? ""
      };
    } catch (err) {
      this.logger.error(
        `DebtorMemoryService LLM error — falling back to heuristic: ${String(err)}`
      );
      return buildHeuristicProfile(contactCount, brokenCount, previousProfile);
    }
  }
}
