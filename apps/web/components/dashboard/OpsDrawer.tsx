"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect } from "react";
import {
  useContactsTodayDetail,
  useActivePromisesDetail,
  useEscalationsTodayDetail,
  type ContactTodayItem,
  type PromiseItem,
  type EscalationItem
} from "../../hooks/use-workflows";
import { formatDateTime } from "../../lib/formatters";
import { cn } from "../../lib/utils";

export type OpsDrawerKind = "contacts" | "promises" | "escalations" | null;

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  voice: "Voz",
  email: "Email",
  sms: "SMS",
  internal: "Sistema"
};

const OUTCOME_LABELS: Record<string, { label: string; className: string }> = {
  promise_made: { label: "Promesa", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  payment_received: { label: "Pagó", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  no_answer: { label: "Sin resp.", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  voicemail: { label: "Buzón", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  refused: { label: "Rechazó", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" }
};

const TITLES: Record<NonNullable<OpsDrawerKind>, string> = {
  contacts: "Contactos de hoy",
  promises: "Promesas activas",
  escalations: "Escalaciones de hoy"
};

interface Props {
  kind: OpsDrawerKind;
  onClose: () => void;
}

function ContactsList({ items, loading }: { items: ContactTodayItem[]; loading: boolean }) {
  if (loading) return <DrawerSkeleton />;
  if (items.length === 0) return <EmptyState text="Sin contactos hoy" />;

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((c) => {
        const outcome = c.outcome ? OUTCOME_LABELS[c.outcome] : null;
        return (
          <li className="flex items-center justify-between gap-3 py-3" key={c.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {c.debtor?.name ?? "—"}
              </p>
              <p className="text-xs text-slate-400">
                {CHANNEL_LABELS[c.channel] ?? c.channel} · {formatDateTime(c.createdAt)}
              </p>
              {c.debt?.portfolio && (
                <p className="text-xs text-slate-400">{c.debt.portfolio.name}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {outcome ? (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", outcome.className)}>
                  {outcome.label}
                </span>
              ) : (
                <span className="text-xs text-slate-300 dark:text-slate-600">{c.status}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PromisesList({ items, loading }: { items: PromiseItem[]; loading: boolean }) {
  if (loading) return <DrawerSkeleton />;
  if (items.length === 0) return <EmptyState text="Sin promesas activas" />;

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((p) => {
        const dueDate = new Date(p.promisedDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isOverdue = dueDate < today;
        const amount = Number(p.amount);
        const currency = p.debt.currency ?? "COP";
        const formatted = new Intl.NumberFormat("es-CO", {
          style: "currency",
          currency,
          maximumFractionDigits: currency === "COP" ? 0 : 2
        }).format(amount);

        return (
          <li className="flex items-center justify-between gap-3 py-3" key={p.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {p.debt.debtor.name}
              </p>
              <p className="text-xs text-slate-400">
                Vence: <span className={cn("font-medium", isOverdue ? "text-red-500" : "text-slate-600 dark:text-slate-300")}>
                  {dueDate.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </p>
              {p.debt.portfolio && (
                <p className="text-xs text-slate-400">{p.debt.portfolio.name}</p>
              )}
            </div>
            <p className="shrink-0 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {formatted}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function EscalationsList({ items, loading }: { items: EscalationItem[]; loading: boolean }) {
  if (loading) return <DrawerSkeleton />;
  if (items.length === 0) return <EmptyState text="Sin escalaciones hoy" />;

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((e) => (
        <li className="flex items-center justify-between gap-3 py-3" key={e.id}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {e.debt?.debtor.name ?? "—"}
            </p>
            <p className="text-xs text-slate-400">
              {e.rule?.name ?? "Regla"} · {formatDateTime(e.createdAt)}
            </p>
            {e.debt?.portfolio && (
              <p className="text-xs text-slate-400">{e.debt.portfolio.name}</p>
            )}
          </div>
          <Link
            className="shrink-0 text-xs font-medium text-[#D85A30] hover:underline"
            href={"/conversations?status=escalated" as Route}
          >
            Ver escaladas
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4 py-2">
      {[1, 2, 3].map((i) => (
        <div className="flex items-center justify-between" key={i}>
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="py-8 text-center text-sm text-slate-400">{text}</p>
  );
}

export function OpsDrawer({ kind, onClose }: Props) {
  const isOpen = kind !== null;

  const contactsQuery = useContactsTodayDetail(kind === "contacts");
  const promisesQuery = useActivePromisesDetail(kind === "promises");
  const escalationsQuery = useEscalationsTodayDetail(kind === "escalations");

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        aria-label={kind ? TITLES[kind] : undefined}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-300 dark:border-slate-700 dark:bg-[#0A0806]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {kind ? TITLES[kind] : ""}
          </h2>
          <button
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            onClick={onClose}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {kind === "contacts" && (
            <ContactsList
              items={contactsQuery.data?.data ?? []}
              loading={contactsQuery.isLoading}
            />
          )}
          {kind === "promises" && (
            <PromisesList
              items={promisesQuery.data?.data ?? []}
              loading={promisesQuery.isLoading}
            />
          )}
          {kind === "escalations" && (
            <EscalationsList
              items={escalationsQuery.data?.data ?? []}
              loading={escalationsQuery.isLoading}
            />
          )}
        </div>
      </aside>
    </>
  );
}
