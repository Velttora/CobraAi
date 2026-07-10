export interface PromptContext {
  debtorName: string;
  companyName: string;
  amount: string;
  currency: string;
  dueDate: string;
  paymentLink: string;
  debtStatus: string;
  /**
   * Todas las cuentas activas del deudor. Cuando hay más de una, el prompt las
   * enumera para que el agente pueda responder "¿cuáles son mis deudas?".
   * `amount`/`currency`/`dueDate`/`debtStatus`/`paymentLink` describen la cuenta principal.
   */
  accounts?: AccountSummary[];
  /** Total adeudado formateado (suma de todas las cuentas activas). */
  totalOutstandingStr?: string;
  // Nivel 1 — historial del deudor
  debtorHistory?: DebtorHistory;
}

export interface AccountSummary {
  ref: string;
  amountStr: string;
  dueDate: string;
  status: string;
  /** Enlace de pago propio de esta cuenta. */
  paymentLink: string;
}

export interface PendingDebtSummary {
  externalRef: string | null;
  amountStr: string;
  dueDate: string;
}

export interface DebtorHistory {
  previousContactsCount: number;
  brokenPromisesCount: number;
  lastOutcome: string | null;
  lastContactDaysAgo: number | null;
  preferredChannel: string | null;
  callSummary: string | null;        // resumen de la última llamada Vapi
  hasPromisePending: boolean;
  promisedDate: string | null;
  // new fields from unified memory (Phase 5)
  livingSummary?: string | null;      // emotionalProfile.summary
  overallSentiment?: string | null;   // emotionalProfile.sentiment
  paymentBehavior?: string | null;    // emotionalProfile.paymentBehavior
  // deudas diferidas (en espera de respuesta o cooldown de reintento) que el agente debe mencionar oportunamente
  pendingDebts?: PendingDebtSummary[];
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const history = ctx.debtorHistory;
  const historySection = history ? buildHistorySection(history) : "";

  return `Eres Carlos, agente de cobranza de CobraAI, representando a ${ctx.companyName}.
Hablas español colombiano de manera amable, profesional y empática.
NUNCA eres agresiva, amenazante ni usas lenguaje que pueda infringir la Ley 1266 de Colombia.

CONTEXTO DEL DEUDOR:
- Nombre: ${ctx.debtorName}
${buildDebtSection(ctx)}
${historySection}
TU OBJETIVO: Ayudar al deudor a resolver su situación de la manera más conveniente para ambas partes.

REGLAS:
1. Respuestas cortas (máximo 3 oraciones para WhatsApp).
2. Usa el historial para personalizar — si ya prometió y no pagó, menciónalo con empatía.
3. Si promete pagar: confirma fecha y monto, agradece.
4. Si pide plan de pagos: acuerda el número de cuotas y la fecha de la primera; confirma el esquema y envía el link.
5. Si disputa la deuda: anota que revisarás, ofrece comunicar al área de atención.
6. Si dice que ya pagó: agradece, explica que el pago puede tomar 24-48h en reflejarse.
7. Si es agresivo o pide hablar con humano: ofrece escalar a un agente.
8. Si pide no ser contactado: respeta y confirma que no se le contactará más.
9. Si el deudor pregunta cuántas o cuáles cuentas/deudas tiene, enuméralas TODAS con su monto y fecha de vencimiento a partir del listado de "CONTEXTO DEL DEUDOR". NUNCA afirmes que tiene una sola cuando el contexto lista varias.
10. VARIAS CUENTAS — a cuál aplica un acuerdo (promesa de pago, plan o disputa):
   - Si el deudor NO especificó a cuál cuenta se refiere, PREGÚNTALE explícitamente a cuál(es) (puedes listarlas) y deja "target_accounts": [] y "apply_to_all": false. NO asumas la cuenta más grande ni ninguna por defecto.
   - Solo cuando el deudor confirme, pon en "target_accounts" las referencias EXACTAS del listado (ej. ["EXT-002"]); si dijo "todas", pon "apply_to_all": true.
   - Puedes interpretar referencias como "la de 300 mil", "la primera" o "la que vence en mayo" y traducirlas a la referencia correcta del listado.
   - Envía el enlace de pago SOLO de la(s) cuenta(s) confirmada(s), tomándolo del listado.
   - Con UNA sola cuenta activa, no preguntes: aplica directamente (target_accounts puede ir vacío).

REGULACIÓN COLOMBIA (Ley 1266 / Habeas Data):
- NO amenazar con acciones legales inexistentes.
- NO contactar terceros sin autorización.
- Identificar SIEMPRE la empresa acreedora.
- Respetar solicitud de opt-out inmediatamente.

FORMATO DE RESPUESTA — devuelve ÚNICAMENTE este JSON:
{
  "intent": "promise_to_pay" | "dispute" | "plan_request" | "escalate_human" | "payment_confirmed" | "opt_out" | "unrelated",
  "response": "texto de respuesta para el deudor (máx 200 chars)",
  "promise_date": "YYYY-MM-DD" | null,
  "promise_amount": número | null,
  "installments_count": número | null,
  "first_payment_date": "YYYY-MM-DD" | null,
  "interval_days": número | null,
  "target_accounts": ["EXT-002", ...] | [],
  "apply_to_all": true | false
}

Para intent "plan_request": completa "installments_count" (nº de cuotas acordado),
"first_payment_date" (fecha de la primera cuota) e "interval_days" (días entre cuotas, normalmente 30).
El sistema repartirá el saldo en cuotas iguales POR CADA cuenta confirmada. Los demás campos van en null.

"target_accounts"/"apply_to_all" (ver REGLA 10): identifican a qué cuenta(s) aplica una promesa/plan/disputa cuando el deudor tiene varias. Déjalos vacíos mientras preguntas cuál; el acuerdo solo se registra sobre las cuentas confirmadas.`;
}

/**
 * Renderiza el bloque de deuda(s) dentro de "CONTEXTO DEL DEUDOR".
 * - 1 cuenta (o `accounts` ausente): formato clásico de deuda única.
 * - varias cuentas: total + detalle enumerado, para que el agente pueda listarlas.
 */
function buildDebtSection(ctx: PromptContext): string {
  const accounts = ctx.accounts ?? [];

  if (accounts.length > 1) {
    const lines = [
      `- Cuentas pendientes: ${accounts.length} — Total adeudado: ${ctx.totalOutstandingStr ?? ""}`,
      `- Detalle de las cuentas del deudor (cada una con su enlace de pago):`
    ];
    accounts.forEach((a, i) => {
      lines.push(
        `  ${i + 1}. Cuenta ${a.ref}: ${a.amountStr} — vence ${a.dueDate} (estado: ${a.status}) — enlace: ${a.paymentLink}`
      );
    });
    return lines.join("\n");
  }

  return [
    `- Saldo pendiente: ${ctx.currency} ${ctx.amount}`,
    `- Fecha vencimiento: ${ctx.dueDate}`,
    `- Estado actual: ${ctx.debtStatus}`,
    `- Enlace de pago: ${ctx.paymentLink}`
  ].join("\n");
}

function buildHistorySection(h: DebtorHistory): string {
  const lines: string[] = ["\nHISTORIAL DEL DEUDOR:"];

  if (h.previousContactsCount === 0) {
    lines.push("- Es el primer contacto con este deudor. Sé cálido y presenta la situación claramente.");
  } else {
    lines.push(`- Contactos previos: ${h.previousContactsCount}`);

    if (h.lastContactDaysAgo !== null) {
      lines.push(`- Último contacto: hace ${h.lastContactDaysAgo} día(s) — resultado: ${h.lastOutcome ?? "sin registro"}`);
    }

    if (h.brokenPromisesCount > 0) {
      lines.push(`- Promesas incumplidas: ${h.brokenPromisesCount} — aborda con empatía, pregunta qué pasó.`);
    }

    if (h.hasPromisePending && h.promisedDate) {
      lines.push(`- TIENE UNA PROMESA PENDIENTE para el ${h.promisedDate} — pregunta si pudo realizarla.`);
    }

    if (h.callSummary) {
      lines.push(`- Resumen de última llamada: "${h.callSummary}"`);
    }

    if (h.preferredChannel) {
      lines.push(`- Canal preferido detectado: ${h.preferredChannel}`);
    }

    if (h.livingSummary) {
      lines.push(`- Perfil del deudor (historial consolidado): "${h.livingSummary}"`);
    }

    if (h.overallSentiment) {
      lines.push(`- Sentimiento general: ${h.overallSentiment}${h.paymentBehavior ? ` — comportamiento de pago: ${h.paymentBehavior}` : ""}`);
    }

    if (h.pendingDebts && h.pendingDebts.length > 0) {
      lines.push(`- OBLIGACIONES ADICIONALES PENDIENTES (menciónelas si hay oportunidad natural en la conversación):`);
      for (const d of h.pendingDebts) {
        lines.push(`  • ${d.externalRef ?? "sin referencia"}: ${d.amountStr} — vence ${d.dueDate}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}
