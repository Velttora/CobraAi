"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { channelLabel } from "../../../lib/contact-channels";
import { formatCurrency, formatRelativeDate } from "../../../lib/formatters";
import type { UncontactedDebt } from "../../../lib/types";
import { useIntegrationHealth, useUncontactedDebts } from "../../../hooks/use-integrations";
import { TableSkeleton } from "../../shared/Skeleton";

const PAGE_SIZE = 25;

function describeBlockedChannels(items: UncontactedDebt[]): string {
  const labels = Array.from(new Set(items.map((i) => channelLabel(i.blockedChannel))));
  if (labels.length <= 1) return labels[0] ?? "el canal";
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

export function UncontactedDebtsTable(): React.ReactElement {
  const [page, setPage] = useState(1);
  const healthQuery = useIntegrationHealth();
  const debtsQuery = useUncontactedDebts(page);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Deudas sin contactar por falta de configuración
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Estas gestiones se detuvieron porque el canal que les tocaba no está configurado. Se
        reanudan solas apenas conectes el canal.
      </p>

      {debtsQuery.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={5} />
        </div>
      ) : debtsQuery.isError ? (
        <div className="mt-4">
          <p className="text-sm text-[#A32D2D]">
            No se pudo cargar el estado de las integraciones.
          </p>
          <button
            className="mt-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
            onClick={() => void debtsQuery.refetch()}
            type="button"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <UncontactedDebtsBody
          allChannelsVerified={
            !!healthQuery.data?.data.summary &&
            healthQuery.data.data.summary.total > 0 &&
            healthQuery.data.data.summary.operational === healthQuery.data.data.summary.total
          }
          onPageChange={setPage}
          page={page}
          total={debtsQuery.data?.data.total ?? 0}
          items={debtsQuery.data?.data.items ?? []}
        />
      )}
    </article>
  );
}

function UncontactedDebtsBody({
  items,
  total,
  page,
  onPageChange,
  allChannelsVerified
}: {
  items: UncontactedDebt[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  allChannelsVerified: boolean;
}): React.ReactElement {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (items.length === 0) {
    if (allChannelsVerified) {
      return (
        <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-[#0F6E56]" />
          <p className="text-sm text-slate-500">Ninguna deuda detenida.</p>
          <p className="text-sm text-slate-500">Todos los canales están operativos.</p>
        </div>
      );
    }
    return (
      <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
        <p className="max-w-md text-sm text-slate-500">
          No hay deudas detenidas todavía, pero con los canales sin configurar dejaremos de
          contactar en cuanto entren nuevas gestiones.
        </p>
        <Link
          className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29]"
          href={"/settings/integrations" as Route}
        >
          Configurar canales
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 rounded-lg border border-[#D85A30]/30 bg-[#D85A30]/5 p-3 text-sm text-slate-700 dark:text-slate-200">
        {total} deudas detenidas. Conecta {describeBlockedChannels(items)} para reanudarlas.
      </div>

      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Deudor</th>
              <th className="px-3 py-2">Deuda</th>
              <th className="px-3 py-2">Canal bloqueado</th>
              <th className="px-3 py-2">Desde</th>
            </tr>
          </thead>
          <tbody>
            {items.map((debt) => (
              <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800" key={debt.debtId}>
                <td className="px-3 py-2">
                  <Link
                    className="text-slate-900 hover:underline dark:text-slate-100"
                    href={`/debtors/${debt.debtorId}` as Route}
                  >
                    {debt.debtorName}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link
                    className="text-slate-900 hover:underline dark:text-slate-100"
                    href={`/debts/${debt.debtId}` as Route}
                  >
                    {debt.externalRef ?? debt.debtId} ·{" "}
                    {formatCurrency(debt.amountOutstanding, debt.currency)}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {channelLabel(debt.blockedChannel)}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-500">{formatRelativeDate(debt.blockedSince)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 space-y-3 sm:hidden">
        {items.map((debt) => (
          <li className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800" key={debt.debtId}>
            <Link
              className="font-medium text-slate-900 hover:underline dark:text-slate-100"
              href={`/debtors/${debt.debtorId}` as Route}
            >
              {debt.debtorName}
            </Link>
            <p className="mt-1">
              <Link
                className="text-slate-700 hover:underline dark:text-slate-300"
                href={`/debts/${debt.debtId}` as Route}
              >
                {debt.externalRef ?? debt.debtId} · {formatCurrency(debt.amountOutstanding, debt.currency)}
              </Link>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {channelLabel(debt.blockedChannel)} · {formatRelativeDate(debt.blockedSince)}
            </p>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <footer className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
          <span className="text-slate-500">
            Página {page} de {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <button
              className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 disabled:opacity-40 dark:border-slate-700"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 disabled:opacity-40 dark:border-slate-700"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
      )}
    </>
  );
}
