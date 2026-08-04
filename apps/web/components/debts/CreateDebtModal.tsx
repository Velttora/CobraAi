"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getCollectionQuarter,
  getInitialDebtStatus,
  getQuarterLabel
} from "../../lib/quarters";
import { useApiClient } from "../../hooks/use-api-client";

export function CreateDebtModal({
  portfolioId,
  onCreated
}: {
  portfolioId: string;
  onCreated?: () => void;
}) {
  const client = useApiClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [debtorName, setDebtorName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency] = useState("COP");
  const [dueDate, setDueDate] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  const preview = useMemo(() => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const scheduled = scheduledDate ? new Date(scheduledDate) : undefined;
    const { status } = getInitialDebtStatus(due, scheduled);
    const quarter = getCollectionQuarter(scheduled ?? due);
    return { status, quarter, label: getQuarterLabel(quarter) };
  }, [dueDate, scheduledDate]);

  async function submit(): Promise<void> {
    setSubmitting(true);
    try {
      await client.post("/api/v1/debts", {
        portfolio_id: portfolioId,
        amount: Number(amount),
        currency,
        due_date: dueDate,
        invoice_date: invoiceDate || undefined,
        payment_terms_days: paymentTermsDays
          ? Number(paymentTermsDays)
          : undefined,
        scheduled_collection_date: scheduledDate || undefined,
        debtor: { name: debtorName }
      });
      toast.success("Cuenta creada");
      setOpen(false);
      onCreated?.();
    } catch {
      toast.error("No se pudo crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        className="rounded-md border border-slate-200 px-4 py-2 text-sm dark:border-slate-700"
        onClick={() => setOpen(true)}
        type="button"
      >
        Nueva cuenta
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-semibold">Nueva cuenta por cobrar</h2>
        <label className="mt-4 block text-sm">
          Deudor
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => setDebtorName(e.target.value)}
            required
            value={debtorName}
          />
        </label>
        <label className="mt-3 block text-sm">
          Monto
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => setAmount(e.target.value)}
            required
            type="number"
            value={amount}
          />
        </label>
        <label className="mt-3 block text-sm">
          Vencimiento
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => setDueDate(e.target.value)}
            required
            type="date"
            value={dueDate}
          />
        </label>

        <button
          className="mt-4 text-sm text-[#D85A30]"
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          ⚙ Opciones de crédito diferido
        </button>

        {expanded
          ? motionDeferredFields({
              invoiceDate,
              onInvoiceDate: setInvoiceDate,
              onPaymentTerms: (days: number) => {
                setPaymentTermsDays(String(days));
                if (invoiceDate && days) {
                  const d = new Date(invoiceDate);
                  d.setUTCDate(d.getUTCDate() + days);
                  setDueDate(d.toISOString().slice(0, 10));
                }
              },
              onScheduledDate: setScheduledDate,
              paymentTermsDays,
              scheduledDate
            })
          : null}

        {preview ? (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
            Se activará en {preview.label} · estado{" "}
            <span className="font-medium capitalize">{preview.status}</span>
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-md px-4 py-2 text-sm"
            onClick={() => setOpen(false)}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-md bg-[#D85A30] px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={submitting}
            type="submit"
          >
            Crear
          </button>
        </div>
      </form>
    </div>
  );
}

function motionDeferredFields({
  paymentTermsDays,
  invoiceDate,
  scheduledDate,
  onPaymentTerms,
  onInvoiceDate,
  onScheduledDate
}: {
  paymentTermsDays: string;
  invoiceDate: string;
  scheduledDate: string;
  onPaymentTerms: (days: number) => void;
  onInvoiceDate: (v: string) => void;
  onScheduledDate: (v: string) => void;
}) {
  return (
    <div className="mt-2 space-y-3">
      <label className="block text-sm">
        Términos de pago (días)
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          onChange={(e) => onPaymentTerms(Number(e.target.value))}
          type="number"
          value={paymentTermsDays}
        />
      </label>
      <label className="block text-sm">
        Fecha de factura
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          onChange={(e) => onInvoiceDate(e.target.value)}
          type="date"
          value={invoiceDate}
        />
      </label>
      <label className="block text-sm">
        Fecha inicio de gestión
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          onChange={(e) => onScheduledDate(e.target.value)}
          type="date"
          value={scheduledDate}
        />
      </label>
    </div>
  );
}
