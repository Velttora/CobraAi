"use client";

import type { Route } from "next";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useImportJobs } from "../../contexts/ImportJobsContext";

export function Topbar({ title }: { title?: string }) {
  const { jobs } = useImportJobs();
  const activeJobs = jobs.filter(
    (job) => !["completed", "failed"].includes(job.status)
  );
  const primaryJob = activeJobs[0];

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-[#0A0806]">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {title ?? "Plataforma de cobranza"}
      </span>
      <div className="flex items-center gap-3">
        {primaryJob ? (
          <Link
            className="inline-flex max-w-xs items-center gap-2 truncate rounded-full bg-[#D85A30]/10 px-3 py-1 text-xs font-medium text-[#D85A30] hover:bg-[#D85A30]/15"
            href={`/portfolios/${primaryJob.portfolioId}/import` as Route}
            title="Ver importación en curso"
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="truncate">
              Importando
              {primaryJob.portfolioName ? `: ${primaryJob.portfolioName}` : ""}
              {activeJobs.length > 1 ? ` (+${activeJobs.length - 1})` : ""}
            </span>
          </Link>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
