"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { ContactModal } from "../../../../components/debts/ContactModal";
import { TimelineEvent } from "../../../../components/debts/TimelineEvent";
import { ScoreCircle } from "../../../../components/debts/ScoreCircle";
import { StatusBadge } from "../../../../components/shared/StatusBadge";
import { CardSkeleton } from "../../../../components/shared/Skeleton";
import { useDebt, useDebtTimeline } from "../../../../hooks/use-debts";
import { useCreatePaymentLink } from "../../../../hooks/use-payments";
import {
  formatAgingBucket,
  formatCurrency,
  formatSegment
} from "../../../../lib/formatters";
import {
  channelLabel,
  resolveContactChannel
} from "../../../../lib/contact-channels";
import { toNumber, type Debt } from "../../../../lib/types";

export default function DebtDetailPage({
  params
}: {
  params: { id: string };
}): React.ReactElement {
  const debtQuery = useDebt(params.id);
  const timelineQuery = useDebtTimeline(params.id);
  const createLink = useCreatePaymentLink();
  const [contactOpen, setContactOpen] = useState(false);
  const debt = debtQuery.data?.data;
  const timeline = timelineQuery.data?.data ?? debt?.timeline_preview ?? [];

  if (debtQuery.isLoading) {
    return (
      <section className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </section>
    );
  }

  if (!debt) {
    return (
      <p className="text-sm text-[#A32D2D]">No se encontró la deuda solicitada.</p>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <Link
          className="text-sm text-[#D85A30] hover:underline"
          href={"/dashboard" as Route}
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
          {debt.debtor?.name ?? "Deuda"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Ref. {debt.externalRef ?? debt.id}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
            onClick={() => setContactOpen(true)}
            type="button"
          >
            Contactar ahora
          </button>
          <button
            className="rounded-md border border-[#D85A30] px-4 py-2 text-sm font-medium text-[#D85A30] hover:bg-orange-50 disabled:opacity-50 dark:hover:bg-slate-800"
            disabled={createLink.isPending}
            onClick={() => void createLink.mutateAsync({ debt_id: debt.id })}
            type="button"
          >
            {createLink.isPending ? "Generando…" : "Generar link de pago"}
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Monto pendiente</dt>
              <dd className="text-lg font-semibold">
                {formatCurrency(toNumber(debt.amountOutstanding), debt.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Vencimiento</dt>
              <dd>{new Date(debt.dueDate).toLocaleDateString("es-CO")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Aging</dt>
              <dd>{formatAgingBucket(debt.agingBucket)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Estado</dt>
              <dd>
                <StatusBadge status={debt.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Segmento IA</dt>
              <dd>{formatSegment(debt.aiSegment ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Canal sugerido</dt>
              <dd>
                <ChannelSuggestion debt={debt} />
              </dd>
            </div>
          </dl>
          {debt.debtor ? (
            <p className="mt-4 text-sm">
              Deudor:{" "}
              <Link
                className="text-[#D85A30] hover:underline"
                href={`/debtors/${debt.debtor.id}` as Route}
              >
                {debt.debtor.name}
              </Link>
            </p>
          ) : null}
        </article>
        <ScoreCircle score={debt.aiScore} />
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">Timeline</h2>
        <ul className="mt-4">
          {(timeline as { type: string; at: string; data?: Record<string, unknown> }[]).map(
            (event, index) => (
              <TimelineEvent
                at={event.at}
                data={event.data}
                key={`${event.type}-${event.at}-${index}`}
                type={event.type}
              />
            )
          )}
        </ul>
      </article>
      {contactOpen ? (
        <ContactModal
          debtId={debt.id}
          debtor={
            debt.debtor
              ? {
                  email: debt.debtor.email,
                  phones: debt.debtor.phones,
                  whatsappOptIn: debt.debtor.whatsappOptIn
                }
              : undefined
          }
          onClose={() => setContactOpen(false)}
          suggestedChannel={debt.bestChannel}
        />
      ) : null}
    </section>
  );
}

function ChannelSuggestion({ debt }: { debt: Debt }): React.ReactElement {
  const debtorSnapshot = debt.debtor
    ? {
        email: debt.debtor.email,
        phones: debt.debtor.phones,
        whatsappOptIn: debt.debtor.whatsappOptIn
      }
    : undefined;

  const { channel, isFallback, originalSuggested } = debtorSnapshot
    ? resolveContactChannel(debt.bestChannel, debtorSnapshot)
    : {
        channel: debt.bestChannel ?? null,
        isFallback: false,
        originalSuggested: null
      };

  return (
    <>
      {channelLabel(channel as string | null)}
      {isFallback && originalSuggested && debt.debtor && (
        <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
          El canal sugerido es <strong>{channelLabel(originalSuggested)}</strong> pero
          falta la información. Por favor agrégala en el perfil.{" "}
          <Link className="underline" href={`/debtors/${debt.debtor.id}` as Route}>
            Editar deudor
          </Link>
        </span>
      )}
      {isFallback && !originalSuggested && channel && debt.debtor && (
        <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
          Canal detectado por disponibilidad. Re-segmenta para recalcular el sugerido.{" "}
          <Link className="underline" href={`/debtors/${debt.debtor.id}` as Route}>
            Editar deudor
          </Link>
        </span>
      )}
      {!channel && (
        <span className="mt-1 block text-xs text-slate-500">
          Agrega email o teléfono en el perfil del deudor.
        </span>
      )}
    </>
  );
}
