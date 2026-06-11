"use client";

import { useState } from "react";
import { cn } from "../../lib/utils";
import type { VoiceMessagePayload } from "../../hooks/use-conversations";

interface Props {
  direction: "in" | "out";
  text: string;
  sentAt: string;
  humanSent?: boolean;
  channel: string;
  voice?: VoiceMessagePayload | null;
}

function VoiceCallBubble({ voice, sentAt }: { voice: VoiceMessagePayload; sentAt: string }) {
  const [open, setOpen] = useState(false);
  const time = new Date(sentAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-none border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 shrink-0 text-[#D85A30]"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Llamada de voz</span>
          <span className="ml-auto text-[10px] text-slate-400">{time}</span>
        </div>

        {voice.summary && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{voice.summary}</p>
        )}

        <button
          className="mt-2 flex items-center gap-1 text-xs font-medium text-[#D85A30] hover:underline"
          onClick={() => { setOpen(!open); }}
          type="button"
        >
          <svg
            className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
          {open ? "Ocultar transcript" : "Ver transcript"}
        </button>

        {open && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
            <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 dark:text-slate-300">
              {voice.transcript}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function MessageBubble({ direction, text, sentAt, humanSent = false, channel, voice }: Props) {
  if (channel === "voice" && voice) {
    return <VoiceCallBubble sentAt={sentAt} voice={voice} />;
  }

  const isOut = direction === "out";
  const time = new Date(sentAt).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div
      className={cn(
        "flex w-full",
        isOut ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm",
          isOut
            ? "rounded-br-none bg-[#D85A30] text-white"
            : "rounded-bl-none bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
        )}
      >
        {humanSent && isOut && (
          <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-white/70">
            <svg
              className="h-3 w-3"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                clipRule="evenodd"
                d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                fillRule="evenodd"
              />
            </svg>
            Agente humano
          </span>
        )}
        <p className="whitespace-pre-wrap break-words">{text}</p>
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-[10px]",
            isOut ? "justify-end text-white/60" : "text-slate-400"
          )}
        >
          <span>{time}</span>
          {channel === "whatsapp" && (
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
