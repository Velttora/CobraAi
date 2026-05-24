"use client";

import { useMemo, useState } from "react";
import {
  useCreateTemplate,
  useTemplates,
  type NotificationTemplate
} from "../../../hooks/use-notifications";
import { renderTemplatePreview } from "../../../lib/template-preview";

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
}

export default function TemplatesSettingsPage(): React.ReactElement {
  const templatesQuery = useTemplates();
  const createTemplate = useCreateTemplate();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [content, setContent] = useState(
    "Hola {{nombre}}, su saldo es {{monto}}. Pague en {{link_pago}}."
  );
  const [preview, setPreview] = useState<string | null>(null);

  const items = templatesQuery.data?.data.items ?? [];

  const variables = useMemo(() => extractVariables(content), [content]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Templates de contacto
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          CRUD de plantillas omnicanal con preview de variables.
        </p>
      </header>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">Nuevo template</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Nombre
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              onChange={(e) => setName(e.target.value)}
              value={name}
            />
          </label>
          <label className="text-sm">
            Canal
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              onChange={(e) => setChannel(e.target.value)}
              value={channel}
            >
              <option value="email">email</option>
              <option value="sms">sms</option>
              <option value="whatsapp">whatsapp</option>
            </select>
          </label>
        </div>
        <label className="mt-4 block text-sm">
          Contenido
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => setContent(e.target.value)}
            value={content}
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Variables: {variables.join(", ") || "—"}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
            disabled={!name || createTemplate.isPending}
            onClick={() => {
              void createTemplate.mutateAsync({
                name,
                channel,
                content,
                variables,
                is_approved: true
              });
              setName("");
            }}
            type="button"
          >
            Guardar
          </button>
          <button
            className="rounded-md border border-slate-200 px-4 py-2 text-sm dark:border-slate-700"
            onClick={() =>
              setPreview(
                renderTemplatePreview(content, {
                  nombre: "María López",
                  monto: "$1.250.000",
                  link_pago: "https://pay.cobrai.dev/abc"
                })
              )
            }
            type="button"
          >
            Preview
          </button>
        </div>
        {preview ? (
          <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950">
            {preview}
          </p>
        ) : null}
      </article>

      <article className="rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="border-b border-slate-200 px-6 py-4 text-sm font-semibold dark:border-slate-800">
          Templates ({items.length})
        </h2>
        <ul>
          {items.map((t: NotificationTemplate) => (
            <li
              className="border-b border-slate-100 px-6 py-4 last:border-0 dark:border-slate-800"
              key={t.id}
            >
              <p className="font-medium">
                {t.name}{" "}
                <span className="text-xs font-normal capitalize text-slate-500">
                  · {t.channel}
                </span>
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                {t.content}
              </p>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
