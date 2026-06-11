"use client";

import { formatDateTime } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { TranscriptViewer } from "./TranscriptViewer";

interface Contact {
  id: string;
  channel: string;
  outcome: string | null;
  duration: number | null;
  transcript: string | null;
  summary: string | null;
  createdAt: string;
  debtor?: { id: string; name: string };
}

interface Props {
  contact: Contact;
}

const OUTCOME_LABELS: Record<string, { label: string; className: string }> = {
  promise_made: {
    label: "Promesa de pago",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
  },
  payment_received: {
    label: "Pago recibido",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
  },
  no_answer: {
    label: "Sin respuesta",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
  },
  voicemail: {
    label: "Buzón de voz",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
  },
  refused: {
    label: "Rechazó",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
  }
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function CallCard({ contact }: Props) {
  const outcome = contact.outcome ? (OUTCOME_LABELS[contact.outcome] ?? null) : null;
  const date = formatDateTime(contact.createdAt);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0f0d0b]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {contact.debtor?.name ?? "Deudor"}
          </p>
          <p className="text-xs text-slate-400">{date}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {formatDuration(contact.duration)}
          </span>
          {outcome && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                outcome.className
              )}
            >
              {outcome.label}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3">
        <TranscriptViewer
          callId={contact.id}
          summary={contact.summary}
          transcript={contact.transcript}
        />
      </div>
    </div>
  );
}
