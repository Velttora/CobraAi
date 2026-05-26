"use client";

import { useState } from "react";
import { cn } from "../../lib/utils";

interface Props {
  transcript: string | null;
  summary?: string | null;
  callId: string;
}

export function TranscriptViewer({ transcript, summary, callId }: Props) {
  const [open, setOpen] = useState(false);

  if (!transcript) {
    return (
      <span className="text-xs italic text-slate-400">Sin transcript</span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {summary && (
        <p className="text-xs text-slate-500">{summary}</p>
      )}
      <button
        className="flex items-center gap-1 text-xs font-medium text-[#D85A30] hover:underline"
        onClick={() => { setOpen(!open); }}
        type="button"
      >
        <svg
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {open ? "Ocultar transcript" : "Ver transcript"}
      </button>
      {open && (
        <div
          className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          id={`transcript-${callId}`}
        >
          <pre className="whitespace-pre-wrap font-sans">{transcript}</pre>
        </div>
      )}
    </div>
  );
}
