"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency } from "../../../lib/formatters";

type PayDetails = {
  deudor_partial_name: string;
  amount: number;
  currency: string;
  gateway_options: string[];
  company_name: string;
  gateway: string;
};

export default function PayPage({
  params
}: {
  params: { token: string };
}): React.ReactElement {
  const searchParams = useSearchParams();
  const [details, setDetails] = useState<PayDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState(searchParams.get("status") === "ok");
  const [gateway, setGateway] = useState<string>("");

  useEffect(() => {
    void fetch(`/api/pay/${params.token}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? "Link inválido");
        setDetails(json.data);
        setGateway(json.data.gateway);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function handlePay(): Promise<void> {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Error al iniciar pago");

      if (json.data.gateway_payment_url) {
        window.location.href = json.data.gateway_payment_url as string;
        return;
      }

      if (json.data.instructions) {
        alert(json.data.instructions);
      }

      const confirmRes = await fetch(`/api/pay/${params.token}/confirm`, {
        method: "POST"
      });
      if (confirmRes.ok) {
        setConfirmed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de pago");
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-slate-600">Cargando…</p>
      </main>
    );
  }

  if (error && !details) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-[#A32D2D]">{error}</p>
      </main>
    );
  }

  if (confirmed && details) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <article className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-emerald-700">Pago recibido</h1>
          <p className="mt-3 text-slate-600">
            Tu pago de {formatCurrency(details.amount, details.currency)} fue registrado.
          </p>
        </article>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <article className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#D85A30]">
            CobraAI Pay
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">
            {details?.company_name}
          </h1>
        </header>

        <dl className="mt-8 space-y-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Deudor</dt>
            <dd className="font-medium">{details?.deudor_partial_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Monto</dt>
            <dd className="text-lg font-bold text-slate-900">
              {details
                ? formatCurrency(details.amount, details.currency)
                : "—"}
            </dd>
          </div>
        </dl>

        <label className="mt-6 block text-sm">
          <span className="text-slate-500">Método de pago</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5"
            onChange={(e) => setGateway(e.target.value)}
            value={gateway}
          >
            {(details?.gateway_options ?? [details?.gateway]).map((g) =>
              g ? (
                <option key={g} value={g}>
                  {g}
                </option>
              ) : null
            )}
          </select>
        </label>

        {error ? <p className="mt-3 text-sm text-[#A32D2D]">{error}</p> : null}

        <button
          className="mt-6 w-full rounded-lg bg-[#D85A30] py-3 text-sm font-semibold text-white hover:bg-[#c24f29] disabled:opacity-50"
          disabled={paying}
          onClick={() => void handlePay()}
          type="button"
        >
          {paying ? "Procesando…" : "Pagar ahora"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Pago seguro · Sin login requerido
        </p>
      </article>
    </main>
  );
}
