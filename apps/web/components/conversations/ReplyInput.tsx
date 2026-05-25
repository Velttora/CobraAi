"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useReplyConversation } from "../../hooks/use-conversations";

interface Props {
  conversationId: string;
}

export function ReplyInput({ conversationId }: Props) {
  const [body, setBody] = useState("");
  const reply = useReplyConversation();

  async function handleSend() {
    if (!body.trim()) return;
    try {
      await reply.mutateAsync({ id: conversationId, body: body.trim() });
      setBody("");
      toast.success("Mensaje enviado");
    } catch {
      toast.error("Error al enviar el mensaje");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      void handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0A0806]">
      <textarea
        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm placeholder-slate-400 outline-none focus:border-[#D85A30] focus:ring-1 focus:ring-[#D85A30] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        onChange={(e) => { setBody(e.target.value); }}
        onKeyDown={handleKeyDown}
        placeholder="Escribe tu respuesta... (Ctrl+Enter para enviar)"
        rows={3}
        value={body}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Solo WhatsApp · Ctrl+Enter para enviar</p>
        <button
          className="rounded-lg bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c04f27] disabled:opacity-50"
          disabled={!body.trim() || reply.isPending}
          onClick={() => { void handleSend(); }}
          type="button"
        >
          {reply.isPending ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}
