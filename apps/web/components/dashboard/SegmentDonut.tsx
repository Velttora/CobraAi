"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatSegment, segmentColor } from "../../lib/formatters";
import type { Debt } from "../../lib/types";
import { Skeleton } from "../shared/Skeleton";

const SEGMENTS = ["critical", "high", "medium", "low", "minimal"] as const;

function buildSegmentData(debts: Debt[]) {
  return SEGMENTS.map((segment) => ({
    name: formatSegment(segment),
    segment,
    value: debts.filter((d) => d.aiSegment === segment).length
  })).filter((row) => row.value > 0);
}

export function SegmentDonut({
  debts,
  loading
}: {
  debts: Debt[];
  loading?: boolean;
}) {
  const data = buildSegmentData(debts);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Segmentación IA
      </h2>
      <div className="mt-2 h-52">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Sin datos de segmentación
          </p>
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                cx="50%"
                cy="50%"
                data={data}
                dataKey="value"
                innerRadius={50}
                nameKey="name"
                outerRadius={80}
              >
                {data.map((entry) => (
                  <Cell fill={segmentColor(entry.segment)} key={entry.segment} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <ul className="mt-2 space-y-1">
        {data.map((row) => (
          <li
            className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400"
            key={row.segment}
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: segmentColor(row.segment) }}
              />
              {row.name}
            </span>
            <span>{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
