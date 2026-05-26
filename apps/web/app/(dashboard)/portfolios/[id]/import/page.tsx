"use client";

import type { Route } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import {
  ImportDropzone,
  ImportProgress
} from "../../../../../components/portfolios/ImportDropzone";
import { usePortfolio } from "../../../../../hooks/use-portfolios";

const COLUMNS = [
  { label: "Referencia",       internal: "external_ref",              req: false, desc: "ID de tu sistema (factura, contrato…)" },
  { label: "Nombre",           internal: "debtor_name",               req: true,  desc: "Nombre o razón social del deudor" },
  { label: "NIT / Cédula",     internal: "debtor_tax_id",             req: false, desc: "NIT o número de cédula" },
  { label: "Teléfono",         internal: "debtor_phone",              req: false, desc: "Número de contacto (ej. 3001234567)" },
  { label: "Correo",           internal: "debtor_email",              req: false, desc: "Correo electrónico del deudor" },
  { label: "Monto",            internal: "amount",                    req: true,  desc: "Valor sin separadores de miles (ej. 1500000)" },
  { label: "Moneda",           internal: "currency",                  req: true,  desc: "COP, USD, EUR…" },
  { label: "Vencimiento",      internal: "due_date",                  req: true,  desc: "Fecha de vencimiento YYYY-MM-DD" },
  { label: "Fecha Factura",    internal: "invoice_date",              req: false, desc: "Fecha de emisión YYYY-MM-DD" },
  { label: "Fecha Cobro",      internal: "scheduled_collection_date", req: false, desc: "Fecha programada de gestión YYYY-MM-DD" },
  { label: "Plazo Días",       internal: "payment_terms_days",        req: false, desc: "Plazo pactado en días (ej. 30)" },
  { label: "Tipo",             internal: "debtor_type",               req: false, desc: "empresa o persona" },
  { label: "Ciudad",           internal: "address_city",              req: false, desc: "Ciudad del deudor" },
  { label: "País",             internal: "address_country",           req: false, desc: "Código de país (ej. CO)" },
  { label: "metadata_*",       internal: "metadata_*",                req: false, desc: "Campos extra con prefijo metadata_ (ej. metadata_contrato)" },
];

export default function PortfolioImportPage({
  params
}: {
  params: { id: string };
}): React.ReactElement {
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
          Sube un CSV, Excel o PDF con tus deudas. También puedes descargar
          nuestro template y llenarlo directamente.
        </p>
      </header>

      {/* Template download */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Template CSV de CobraAI
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Descarga, rellena con tus datos y súbelo aquí.
            </p>
          </div>
          <a
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
            download="cobrai-template.csv"
            href="/templates/cobrai-template.csv"
          >
            <Download className="h-4 w-4" />
            Descargar template
          </a>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="pb-1.5 pr-4 text-left font-medium text-slate-700 dark:text-slate-300">
                  Columna
                </th>
                <th className="pb-1.5 pr-4 text-left font-medium text-slate-700 dark:text-slate-300">
                  Requerido
                </th>
                <th className="pb-1.5 text-left font-medium text-slate-700 dark:text-slate-300">
                  Descripción
                </th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((col) => (
                <tr
                  className="border-b border-slate-50 last:border-0 dark:border-slate-800/50"
                  key={col.internal}
                >
                  <td className="py-1.5 pr-4">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {col.label}
                    </span>
                    {col.internal !== col.label && col.internal !== "metadata_*" && (
                      <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                        {col.internal}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4">
                    {col.req ? (
                      <span className="rounded-full bg-[#D85A30]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#D85A30]">
                        obligatorio
                      </span>
                    ) : (
                      <span className="text-slate-400">opcional</span>
                    )}
                  </td>
                  <td className="py-1.5 text-slate-500">{col.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ImportDropzone
        portfolioId={params.id}
        portfolioName={portfolio?.name}
      />
      <ImportProgress portfolioId={params.id} />
    </section>
  );
}
