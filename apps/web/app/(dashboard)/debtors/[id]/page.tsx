"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { EditDebtorForm } from "../../../../components/debtors/EditDebtorForm";
import { StatusBadge } from "../../../../components/shared/StatusBadge";
import { ResponseStatusBadge } from "../../../../components/shared/ResponseStatusBadge";
import { CardSkeleton } from "../../../../components/shared/Skeleton";
import { useConversation } from "../../../../hooks/use-notifications";
import { useDebtor } from "../../../../hooks/use-portfolios";
import { formatCurrency, formatDateTime } from "../../../../lib/formatters";
import type { Debt } from "../../../../lib/types";
import { toNumber } from "../../../../lib/types";

type DebtorDetail = {
  id: string;
  name: string;
  email?: string | null;
  phones: string[];
  whatsappOptIn: boolean;
  taxId?: string | null;
  type: string;
  debts?: Debt[];
};

export default function DebtorDetailPage({
  params
}: {
  params: { id: string };
}): React.ReactElement {
  const query = useDebtor(params.id);
  const conversationQuery = useConversation(params.id);
  const [tab, setTab] = useState<"debts" | "conversations">("debts");
  const debtor = query.data?.data as DebtorDetail | undefined;
  const messages = conversationQuery.data?.data.messages ?? [];

  if (query.isLoading) {
    return (
      <section className="space-y-4">
        <CardSkeleton />
      </section>
    );
  }

  if (!debtor) {
    return (
      <p className="text-sm text-[#A32D2D]">No se encontró el deudor solicitado.</p>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {debtor.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500 capitalize">{debtor.type}</p>
      </header>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <EditDebtorForm
          debtorId={debtor.id}
          initial={{
            name: debtor.name,
            email: debtor.email,
            phones: debtor.phones,
            whatsappOptIn: debtor.whatsappOptIn
          }}
          onSaved={() => void query.refetch()}
        />
        <dl className="mt-6 grid gap-3 border-t border-slate-100 pt-6 sm:grid-cols-2 text-sm dark:border-slate-800">
          <div>
            <dt className="text-slate-500">NIT / ID</dt>
            <dd>{debtor.taxId ?? "—"}</dd>
          </div>
        </dl>
      </article>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          className={`px-4 py-2 text-sm ${tab === "debts" ? "border-b-2 border-[#D85A30] font-medium" : "text-slate-500"}`}
          onClick={() => setTab("debts")}
          type="button"
        >
          Deudas
        </button>
        <button
          className={`px-4 py-2 text-sm ${tab === "conversations" ? "border-b-2 border-[#D85A30] font-medium" : "text-slate-500"}`}
          onClick={() => setTab("conversations")}
          type="button"
        >
          Conversaciones
        </button>
      </div>

      {tab === "debts" ? (
      <article className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <h2 className="border-b border-slate-200 px-6 py-4 text-sm font-semibold dark:border-slate-800">
          Deudas ({debtor.debts?.length ?? 0})
        </h2>
        <ul>
          {(debtor.debts ?? []).map((debt) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 last:border-0 dark:border-slate-800"
              key={debt.id}
            >
              <div>
                <Link
                  className="font-medium text-[#D85A30] hover:underline"
                  href={`/debts/${debt.id}` as Route}
                >
                  {formatCurrency(toNumber(debt.amountOutstanding), debt.currency)}
                </Link>
                <p className="text-xs text-slate-500">
                  Vence {new Date(debt.dueDate).toLocaleDateString("es-CO")}
                  {debt.portfolio?.name ? (
                    <span className="ml-2 text-slate-400">· {debt.portfolio.name}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={debt.status} />
                {debt.lastContactResponseStatus ? (
                  <ResponseStatusBadge
                    attemptNumber={debt.lastContactAttempt}
                    status={debt.lastContactResponseStatus}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </article>
      ) : (
      <article className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <h2 className="border-b border-slate-200 px-6 py-4 text-sm font-semibold dark:border-slate-800">
          Hilo unificado ({messages.length})
        </h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {messages.length === 0 ? (
            <li className="px-6 py-8 text-sm text-slate-500">
              Sin mensajes aún. Usa &quot;Contactar ahora&quot; en una deuda.
            </li>
          ) : (
            messages.map((msg) => (
              <li className="px-6 py-4 text-sm" key={msg.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="capitalize text-slate-500">
                    {msg.channel} · {msg.direction === "out" ? "Saliente" : "Entrante"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(msg.sent_at)}
                  </span>
                </div>
                <p className="mt-2">{msg.content}</p>
              </li>
            ))
          )}
        </ul>
      </article>
      )}
    </section>
  );
}
