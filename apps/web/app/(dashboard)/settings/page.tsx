"use client";

import { useState } from "react";
import { usePortfolios } from "../../../hooks/use-portfolios";
import { useWorkflowStats } from "../../../hooks/use-workflows";
import {
  useCreateTemplate,
  useDeleteTemplate,
  useTemplates,
  useUpdateTemplate,
  type NotificationTemplate
} from "../../../hooks/use-notifications";
import { renderTemplatePreview } from "../../../lib/template-preview";
import { WorkflowRulesManager } from "../../../components/workflows/WorkflowRulesManager";

type Tab = "rules" | "templates";

export default function SettingsPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>("rules");
  const [portfolioId, setPortfolioId] = useState("");

  const portfoliosQuery = usePortfolios();
  const portfolios = portfoliosQuery.data?.data.items ?? [];
  const selectedPortfolioId = portfolioId || portfolios[0]?.id || "";

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Configuración
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Automatización y templates por portafolio.
        </p>
      </header>

      <label className="block max-w-sm text-sm font-medium">
        Portafolio
        <select
          className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          onChange={(e) => setPortfolioId(e.target.value)}
          value={selectedPortfolioId}
        >
          {portfolios.length === 0 ? (
            <option value="">Sin portafolios</option>
          ) : (
            portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>
      </label>

      <StatsRow />

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <TabButton active={tab === "rules"} onClick={() => setTab("rules")}>
          Automatización
        </TabButton>
        <TabButton active={tab === "templates"} onClick={() => setTab("templates")}>
          Templates
        </TabButton>
      </div>

      {tab === "rules" ? (
        <WorkflowRulesManager portfolioId={selectedPortfolioId} />
      ) : (
        <TemplatesSection />
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-[#D85A30] text-[#D85A30]"
          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function StatsRow(): React.ReactElement {
  const statsQuery = useWorkflowStats();
  const stats = statsQuery.data?.data;
  if (!stats) return <></>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Contactos hoy" value={stats.contacts_today} />
      <StatCard label="Promesas activas" value={stats.active_promises} />
      <StatCard label="Escalamientos hoy" value={stats.escalations_today} />
      <StatCard label="Ejecuciones hoy" value={stats.executions_today} />
    </div>
  );
}

function StatCard({
  label,
  value
}: {
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}

// ─── Templates ──────────────────────────────────────────────────────────────

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
}

type TemplateForm = { name: string; channel: string; content: string };

const emptyTemplateForm: TemplateForm = {
  name: "",
  channel: "email",
  content: "Hola {{nombre}}, su saldo es {{monto}}. Pague en {{link_pago}}."
};

function templateToForm(t: NotificationTemplate): TemplateForm {
  return { name: t.name, channel: t.channel, content: t.content };
}

function TemplatesSection(): React.ReactElement {
  const templatesQuery = useTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<TemplateForm>(emptyTemplateForm);
  const [editForm, setEditForm] = useState<TemplateForm>(emptyTemplateForm);
  const [preview, setPreview] = useState<string | null>(null);

  const items = templatesQuery.data?.data.items ?? [];
  const isPending =
    createTemplate.isPending || updateTemplate.isPending || deleteTemplate.isPending;

  function handleCreate() {
    if (!newForm.name) return;
    createTemplate.mutate(
      {
        name: newForm.name,
        channel: newForm.channel,
        content: newForm.content,
        variables: extractVariables(newForm.content),
        is_approved: true
      },
      {
        onSuccess: () => {
          setShowNew(false);
          setNewForm(emptyTemplateForm);
          setPreview(null);
        }
      }
    );
  }

  function handleUpdate() {
    if (!editingId || !editForm.name) return;
    updateTemplate.mutate(
      {
        id: editingId,
        name: editForm.name,
        channel: editForm.channel,
        content: editForm.content,
        variables: extractVariables(editForm.content)
      },
      { onSuccess: () => setEditingId(null) }
    );
  }

  function startEdit(t: NotificationTemplate) {
    setEditForm(templateToForm(t));
    setEditingId(t.id);
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold">
          Templates de contacto
          {items.length > 0 && (
            <span className="ml-2 font-normal text-slate-500">{items.length} total</span>
          )}
        </h2>
        <button
          className="text-sm text-[#D85A30] hover:underline"
          onClick={() => {
            setShowNew(!showNew);
            setPreview(null);
          }}
          type="button"
        >
          {showNew ? "Cancelar" : "+ Nuevo template"}
        </button>
      </div>

      {showNew && (
        <div className="border-b border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
          <TemplateFormFields form={newForm} onChange={setNewForm} />
          {preview && (
            <p className="mt-3 rounded-md bg-white p-3 text-sm dark:bg-slate-900">{preview}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-50"
              disabled={!newForm.name || isPending}
              onClick={handleCreate}
              type="button"
            >
              Guardar
            </button>
            <button
              className="rounded-md border border-slate-200 px-4 py-2 text-sm dark:border-slate-700"
              onClick={() =>
                setPreview(
                  renderTemplatePreview(newForm.content, {
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
        </div>
      )}

      {items.length === 0 && !showNew ? (
        <p className="px-5 py-8 text-sm text-slate-500">
          Sin templates. Usa &ldquo;+ Nuevo template&rdquo; para crear el primero.
        </p>
      ) : (
        <ul>
          {items.map((t) =>
            editingId === t.id ? (
              <li
                className="border-b border-slate-100 bg-slate-50 px-5 py-4 last:border-0 dark:border-slate-800 dark:bg-slate-950"
                key={t.id}
              >
                <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Editando: {t.name}
                </p>
                <TemplateFormFields form={editForm} onChange={setEditForm} />
                <div className="mt-4 flex gap-2">
                  <button
                    className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-50"
                    disabled={!editForm.name || isPending}
                    onClick={handleUpdate}
                    type="button"
                  >
                    Guardar
                  </button>
                  <button
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm dark:border-slate-700"
                    onClick={() => setEditingId(null)}
                    type="button"
                  >
                    Cancelar
                  </button>
                </div>
              </li>
            ) : (
              <TemplateRow
                isPending={isPending}
                key={t.id}
                onDelete={() => deleteTemplate.mutate(t.id)}
                onEdit={() => startEdit(t)}
                template={t}
              />
            )
          )}
        </ul>
      )}
    </article>
  );
}

function TemplateFormFields({
  form,
  onChange
}: {
  form: TemplateForm;
  onChange: (f: TemplateForm) => void;
}): React.ReactElement {
  const set =
    (key: keyof TemplateForm) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) =>
      onChange({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Nombre *
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={set("name")}
            value={form.name}
          />
        </label>
        <label className="text-sm">
          Canal
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={set("channel")}
            value={form.channel}
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Contenido
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
          onChange={set("content")}
          value={form.content}
        />
      </label>
      <p className="text-xs text-slate-500">
        Variables: {extractVariables(form.content).join(", ") || "—"}
      </p>
    </div>
  );
}

function TemplateRow({
  template,
  isPending,
  onEdit,
  onDelete
}: {
  template: NotificationTemplate;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): React.ReactElement {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 last:border-0 dark:border-slate-800">
      <div className="min-w-0">
        <p className="font-medium text-slate-900 dark:text-slate-100">
          {template.name}
          <span className="ml-1.5 text-xs font-normal capitalize text-slate-500">
            · {template.channel}
          </span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
          {template.content}
        </p>
      </div>
      <div className="flex shrink-0 gap-3">
        <button
          className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:hover:text-slate-100"
          disabled={isPending}
          onClick={onEdit}
          type="button"
        >
          Editar
        </button>
        <button
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
          disabled={isPending}
          onClick={onDelete}
          type="button"
        >
          Eliminar
        </button>
      </div>
    </li>
  );
}
