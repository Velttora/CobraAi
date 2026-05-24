"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import {
  ImportDropzone,
  ImportProgress
} from "../../../../../components/portfolios/ImportDropzone";
import { usePortfolio } from "../../../../../hooks/use-portfolios";

export default function PortfolioImportPage({
  params
}: {
  params: { id: string };
}): React.ReactElement {
  const [jobId, setJobId] = useState<string | null>(null);
  const portfolioQuery = usePortfolio(params.id);
  const portfolio = portfolioQuery.data?.data;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link
          className="text-sm text-[#D85A30] hover:underline"
          href={`/portfolios/${params.id}` as Route}
        >
          ← {portfolio?.name ?? "Portafolio"}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
          Importar cartera
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Sube un archivo CSV o Excel con las columnas del template de CobraAI.
        </p>
      </header>

      <ImportDropzone onJobCreated={setJobId} portfolioId={params.id} />
      {jobId ? (
        <ImportProgress jobId={jobId} portfolioId={params.id} />
      ) : null}
    </section>
  );
}
