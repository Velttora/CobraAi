"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { Route } from "next";
import { ConversationThread } from "../../../../components/conversations/ConversationThread";
import { ReplyInput } from "../../../../components/conversations/ReplyInput";
import { useConversationThread } from "../../../../hooks/use-conversations";

export default function ConversationDetailPage() {
  const params = useParams();
  const id = params["id"] as string;

  const { data, isLoading } = useConversationThread(id);
  const thread = data?.data;

  const isEscalated = thread?.status === "escalated";
  const isVoice = thread?.channel === "voice";
  // El backend resuelve/redirige el canal (whatsapp/email) según configuración del
  // deudor; permitimos responder en cualquier canal excepto SMS (deshabilitado).
  const canReply = !!thread && thread.channel !== "sms";

  return (
    <section className="flex h-[calc(100vh-5rem)] flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-[#0A0806]">
        <Link
          className="text-sm text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          href={"/conversations" as Route}
        >
          ← Volver
        </Link>
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Conversación {id.slice(0, 8)}…
          </p>
          {thread && (
            <p className="text-xs capitalize text-slate-400">
              {thread.channel} · {thread.total} mensajes
            </p>
          )}
        </div>
      </div>

      {/* Escalation banner */}
      {isEscalated && (
        <div className="shrink-0 bg-amber-50 px-6 py-3 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            ⚠️ Esta conversación requiere atención humana
          </p>
        </div>
      )}

      {/* Message thread */}
      <ConversationThread
        isLoading={isLoading}
        messages={thread?.messages ?? []}
      />

      {/* Reply input — el backend resuelve el canal (whatsapp/email); voz se redirige */}
      {canReply && !isLoading && (
        <div className="shrink-0">
          {isVoice && (
            <p className="px-6 pt-3 text-xs text-slate-400">
              Es una llamada de voz; tu respuesta se enviará por WhatsApp o email según la configuración del deudor.
            </p>
          )}
          <ReplyInput conversationId={id} />
        </div>
      )}

      {!canReply && !isLoading && thread && (
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-400">
            Este canal no permite respuesta manual
          </p>
        </div>
      )}
    </section>
  );
}
