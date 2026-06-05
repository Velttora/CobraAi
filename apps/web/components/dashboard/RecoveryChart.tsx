"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { Debt } from "../../lib/types";
import { toNumber } from "../../lib/types";
import { resolveMessageChannel } from "../../lib/feature-flags";
import { formatCurrency } from "../../lib/formatters";
import { Skeleton } from "../shared/Skeleton";

const CHANNELS = ["whatsapp", "voice", "email"] as const;
const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  voice: "Voz",
  email: "Email"
};

function buildChartData(debts: Debt[]) {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return months.map((month) => {
    const row: Record<string, string | number> = {
      month: month.slice(5)
    };
    for (const channel of CHANNELS) {
      row[channel] = debts
        .filter((debt) => {
          const created = debt.createdAt.slice(0, 7);
          const ch = resolveMessageChannel(
            (debt.bestChannel ?? "whatsapp").toLowerCase()
          );
          return created === month && ch === channel;
        })
        .reduce((sum, debt) => sum + toNumber(debt.amountOutstanding), 0);
    }
    return row;
  });
}

export function RecoveryChart({
  debts,
  loading
}: {
  debts: Debt[];
  loading?: boolean;
}) {
  const data = buildChartData(debts);

  if (loading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Cartera por canal (últimos 6 meses)
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Monto pendiente agrupado por mes de creación y canal IA sugerido
      </p>
      <div className="mt-4 h-64">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value) =>
                formatCurrency(typeof value === "number" ? value : Number(value))
              }
              labelFormatter={(label) => `Mes ${label}`}
            />
            <Legend formatter={(value) => CHANNEL_LABELS[value] ?? value} />
            {CHANNELS.map((channel, index) => (
              <Bar
                dataKey={channel}
                fill={
                  ["#25D366", "#D85A30", "#64748B", "#0F6E56"][index] ??
                  "#94A3B8"
                }
                key={channel}
                stackId="a"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
