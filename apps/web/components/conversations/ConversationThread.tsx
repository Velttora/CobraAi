"use client";

import { useEffect, useRef } from "react";
import type { ConversationMessage } from "../../hooks/use-conversations";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: ConversationMessage[];
  isLoading?: boolean;
}

export function ConversationThread({ messages, isLoading = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Cargando conversación…</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Sin mensajes aún</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((m) => (
        <MessageBubble
          channel={m.channel}
          direction={m.direction}
          humanSent={m.human_sent}
          key={m.id}
          sentAt={m.sent_at}
          text={m.text}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
