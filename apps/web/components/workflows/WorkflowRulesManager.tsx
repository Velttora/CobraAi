"use client";

import { useMemo, useState } from "react";
import {
  useCreateTemplate,
  useTemplates,
  useUpdateTemplate,
  type NotificationTemplate
} from "../../hooks/use-notifications";
import {
  useCreateWorkflowRule,
  useDeleteWorkflowRule,
  useToggleWorkflowRule,
  useUpdateWorkflowRule,
  useWorkflowRules,
  type WorkflowRule
} from "../../hooks/use-workflows";
import {
  featureFlags,
  resolveMessageChannel,
  sanitizeChannelText
} from "../../lib/feature-flags";
import { renderTemplatePreview } from "../../lib/template-preview";
import {
  describeWorkflowRule,
  sortWorkflowRulesForDisplay
} from "../../lib/workflow-rules";

const TRIGGERS = [
  { value: "debt_created", label: "Deuda creada" },
  { value: "debt_updated", label: "Deuda actualizada" },
  { value: "score_updated", label: "Score actualizado" },
  { value: "promise_broken", label: "Promesa incumplida" },
  { value: "payment_confirmed", label: "Pago confirmado" },
  { value: "schedule", label: "Programado" },
  { value: "manual", label: "Manual" }
] as const;

const ACTIONS = [
  { value: "send_notification", label: "Enviar notificación" },
  { value: "escalate_human", label: "Escalar a humano" },
  { value: "update_status", label: "Actualizar estado" },
  { value: "assign_strategy", label: "Asignar estrategia" },
  { value: "create_task", label: "Crear tarea" }
] as const;

const CHANNELS = [
  { value: "", label: "— ninguno —" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "voice", label: "Voz" },
  { value: "email", label: "Email" }
] as const;

const TEMPLATE_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "voice", label: "Voz (guion)" }
].filter((c) => c.value !== "sms" || featureFlags.sms);

const DEFAULT_TEMPLATE_CONTENT =
  "Hola {{nombre}}, su saldo es {{monto}}. Pague en {{link_pago}}.";

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
}

type RuleForm = {
  name: string;
  trigger: string;
  action: string;
  channel: string;
  delay_hours: string;
  priority: string;
};

const emptyRuleForm: RuleForm = {
  name: "",
  trigger: "debt_created",
  action: "send_notification",
  channel: "",
  delay_hours: "",
  priority: ""
};

function ruleToForm(rule: WorkflowRule): RuleForm {
  return {
    name: rule.name,
    trigger: rule.trigger,
    action: rule.action,
    channel: rule.channel ?? "",
    delay_hours: rule.delayHours ? String(rule.delayHours) : "",
    priority: rule.priority ? String(rule.priority) : ""
  };
}

export function WorkflowRulesManager({
  portfolioId
}: {
  portfolioId: string;
}): React.ReactElement {
  const rulesQuery = useWorkflowRules(portfolioId);
  const templatesQuery = useTemplates();
  const toggleRule = useToggleWorkflowRule(portfolioId);
  const deleteRule = useDeleteWorkflowRule(portfolioId);
  const createRule = useCreateWorkflowRule(portfolioId);
  const updateRule = useUpdateWorkflowRule(portfolioId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateRuleId, setTemplateRuleId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<RuleForm>(emptyRuleForm);
  const [editForm, setEditForm] = useState<RuleForm>(emptyRuleForm);

  const rules = useMemo(
    () => sortWorkflowRulesForDisplay(rulesQuery.data?.data ?? []),
    [rulesQuery.data?.data]
  );
  const templates = templatesQuery.data?.data.items ?? [];
  const templateById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );
  const activeCount = rules.filter((r) => r.isActive).length;
  const inactiveCount = rules.filter((r) => !r.isActive).length;
  const isPending =
    toggleRule.isPending ||
    deleteRule.isPending ||
    createRule.isPending ||
    updateRule.isPending;

  function handleCreate() {
    if (!newForm.name || !portfolioId) return;
    createRule.mutate(
      {
        portfolio_id: portfolioId,
        name: newForm.name,
        trigger: newForm.trigger,
        action: newForm.action,
        ...(newForm.channel ? { channel: newForm.channel } : {}),
        ...(newForm.delay_hours ? { delay_hours: Number(newForm.delay_hours) } : {}),
        ...(newForm.priority ? { priority: Number(newForm.priority) } : {})
      },
      {
        onSuccess: () => {
          setShowNew(false);
          setNewForm(emptyRuleForm);
        }
      }
    );
  }

  function handleUpdate() {
    if (!editingId || !editForm.name) return;
    updateRule.mutate(
      {
        id: editingId,
        name: editForm.name,
        action: editForm.action,
        ...(editForm.channel ? { channel: editForm.channel } : {}),
        ...(editForm.delay_hours ? { delay_hours: Number(editForm.delay_hours) } : {}),
        ...(editForm.priority ? { priority: Number(editForm.priority) } : {})
      },
      { onSuccess: () => setEditingId(null) }
    );
  }

  function startEdit(rule: WorkflowRule) {
    setEditForm(ruleToForm(rule));
    setEditingId(rule.id);
    setTemplateRuleId(null);
  }

  function toggleTemplate(rule: WorkflowRule) {
    setTemplateRuleId((current) => (current === rule.id ? null : rule.id));
    setEditingId(null);
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold">
          Reglas de automatización
          {rules.length > 0 && (
            <span className="ml-2 font-normal text-slate-500">
              {activeCount} activas
              {inactiveCount > 0 ? ` · ${inactiveCount} inactivas` : ""}
            </span>
          )}
        </h2>
        {portfolioId && featureFlags.workflowRuleCreation && (
          <button
            className="text-sm text-[#D85A30] hover:underline"
            onClick={() => {
              setShowNew(!showNew);
              setNewForm(emptyRuleForm);
            }}
            type="button"
          >
            {showNew ? "Cancelar" : "+ Nueva regla"}
          </button>
        )}
      </div>

      {featureFlags.workflowRuleCreation && showNew && (
        <div className="border-b border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
          <RuleFormFields form={newForm} onChange={setNewForm} />
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-50"
              disabled={!newForm.name || isPending}
              onClick={handleCreate}
              type="button"
            >
              Crear regla
            </button>
          </div>
        </div>
      )}

      {!portfolioId ? (
        <p className="px-5 py-8 text-sm text-slate-500">
          Selecciona un portafolio para ver sus reglas.
        </p>
      ) : rules.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">
          {featureFlags.workflowRuleCreation
            ? "Sin reglas. Usa “+ Nueva regla” para crear la primera."
            : "Sin reglas. Aplica un paquete de estrategia para configurar la automatización."}
        </p>
      ) : (
        <ul>
          {rules.map((rule) =>
            editingId === rule.id ? (
              <li
                className="border-b border-slate-100 bg-slate-50 px-5 py-4 last:border-0 dark:border-slate-800 dark:bg-slate-950"
                key={rule.id}
              >
                <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Editando: {sanitizeChannelText(rule.name)}
                </p>
                <RuleFormFields form={editForm} hidesTrigger onChange={setEditForm} />
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
              <li
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                key={rule.id}
              >
                <RuleRow
                  hasTemplate={Boolean(
                    rule.templateId && templateById.has(rule.templateId)
                  )}
                  isPending={isPending}
                  isTemplateOpen={templateRuleId === rule.id}
                  onDelete={() => deleteRule.mutate(rule.id)}
                  onEdit={() => startEdit(rule)}
                  onToggle={(id, isActive) => toggleRule.mutate({ id, isActive })}
                  onToggleTemplate={() => toggleTemplate(rule)}
                  rule={rule}
                />
                {templateRuleId === rule.id && rule.action === "send_notification" ? (
                  <RuleTemplateEditor
                    onClose={() => setTemplateRuleId(null)}
                    portfolioId={portfolioId}
                    rule={rule}
                    template={
                      rule.templateId
                        ? templateById.get(rule.templateId) ?? null
                        : null
                    }
                  />
                ) : null}
              </li>
            )
          )}
        </ul>
      )}
    </article>
  );
}

function RuleFormFields({
  form,
  onChange,
  hidesTrigger = false
}: {
  form: RuleForm;
  onChange: (f: RuleForm) => void;
  hidesTrigger?: boolean;
}): React.ReactElement {
  const set =
    (key: keyof RuleForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...form, [key]: e.target.value });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        Nombre *
        <input
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          onChange={set("name")}
          value={form.name}
        />
      </label>
      {!hidesTrigger && (
        <label className="text-sm">
          Disparador
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={set("trigger")}
            value={form.trigger}
          >
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm">
        Acción
        <select
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          onChange={set("action")}
          value={form.action}
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Canal
        <select
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          onChange={set("channel")}
          value={form.channel}
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Delay (horas)
        <input
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          min="0"
          onChange={set("delay_hours")}
          type="number"
          value={form.delay_hours}
        />
      </label>
      <label className="text-sm">
        Prioridad
        <input
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          min="0"
          onChange={set("priority")}
          type="number"
          value={form.priority}
        />
      </label>
    </div>
  );
}

function RuleRow({
  rule,
  hasTemplate,
  isTemplateOpen,
  isPending,
  onToggle,
  onToggleTemplate,
  onEdit,
  onDelete
}: {
  rule: WorkflowRule;
  hasTemplate: boolean;
  isTemplateOpen: boolean;
  isPending: boolean;
  onToggle: (id: string, isActive: boolean) => void;
  onToggleTemplate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const canTemplate = rule.action === "send_notification";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${!rule.isActive ? "opacity-50" : ""}`}
    >
      {canTemplate ? (
        <button
          aria-expanded={isTemplateOpen}
          className="min-w-0 flex-1 text-left"
          onClick={onToggleTemplate}
          type="button"
        >
          <RuleSummary hasTemplate={hasTemplate} rule={rule} showTemplateHint />
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <RuleSummary hasTemplate={hasTemplate} rule={rule} />
        </div>
      )}
      <div className="flex items-center gap-3">
        {canTemplate && (
          <button
            className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:border-[#D85A30] hover:text-[#D85A30] disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            disabled={isPending}
            onClick={onToggleTemplate}
            type="button"
          >
            {isTemplateOpen ? "Cerrar" : hasTemplate ? "Editar mensaje" : "Crear mensaje"}
          </button>
        )}
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input
            checked={rule.isActive}
            disabled={isPending}
            onChange={(e) => onToggle(rule.id, e.target.checked)}
            type="checkbox"
          />
          Activa
        </label>
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
    </div>
  );
}

function RuleSummary({
  rule,
  hasTemplate,
  showTemplateHint = false
}: {
  rule: WorkflowRule;
  hasTemplate: boolean;
  showTemplateHint?: boolean;
}): React.ReactElement {
  const { when, does, timing } = describeWorkflowRule(rule);
  return (
    <>
      <p className="font-medium text-slate-900 dark:text-slate-100">
        {sanitizeChannelText(rule.name)}
      </p>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        <span className="text-slate-500">{when}</span>
        <span className="mx-1.5 text-slate-400">→</span>
        <span className="font-medium text-slate-700 dark:text-slate-200">{does}</span>
        {timing ? (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">
            {timing}
          </span>
        ) : null}
      </p>
      {showTemplateHint && (
        <p
          className={`mt-1 text-xs font-medium ${
            hasTemplate ? "text-emerald-600" : "text-[#D85A30]"
          }`}
        >
          {hasTemplate ? "Mensaje configurado" : "Sin mensaje · clic para crear"}
        </p>
      )}
    </>
  );
}

type TemplateForm = { name: string; channel: string; content: string };

function RuleTemplateEditor({
  rule,
  template,
  portfolioId,
  onClose
}: {
  rule: WorkflowRule;
  template: NotificationTemplate | null;
  portfolioId: string;
  onClose: () => void;
}): React.ReactElement {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const updateRule = useUpdateWorkflowRule(portfolioId);

  const [form, setForm] = useState<TemplateForm>(() =>
    template
      ? {
          name: template.name,
          channel: resolveMessageChannel(template.channel),
          content: template.content
        }
      : {
          name: sanitizeChannelText(rule.name),
          channel: resolveMessageChannel(rule.channel) ?? "email",
          content: DEFAULT_TEMPLATE_CONTENT
        }
  );
  const [preview, setPreview] = useState<string | null>(null);

  const isPending =
    createTemplate.isPending || updateTemplate.isPending || updateRule.isPending;

  const set =
    (key: keyof TemplateForm) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) =>
      setForm({ ...form, [key]: e.target.value });

  function handleSave() {
    if (!form.name || !form.content) return;
    const variables = extractVariables(form.content);

    if (template) {
      updateTemplate.mutate(
        {
          id: template.id,
          name: form.name,
          channel: form.channel,
          content: form.content,
          variables
        },
        { onSuccess: () => onClose() }
      );
      return;
    }

    createTemplate.mutate(
      {
        name: form.name,
        channel: form.channel,
        content: form.content,
        variables,
        is_approved: true
      },
      {
        onSuccess: (res) => {
          updateRule.mutate(
            { id: rule.id, template_id: res.data.id },
            { onSuccess: () => onClose() }
          );
        }
      }
    );
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
        Mensaje para esta regla
      </p>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Nombre *
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              onChange={set("name")}
              value={form.name}
            />
          </label>
          <label className="text-sm">
            Canal
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              onChange={set("channel")}
              value={form.channel}
            >
              {TEMPLATE_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          Contenido
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
            onChange={set("content")}
            value={form.content}
          />
        </label>
        <p className="text-xs text-slate-500">
          Variables: {extractVariables(form.content).join(", ") || "—"}
        </p>
        {preview && (
          <p className="rounded-md bg-white p-3 text-sm dark:bg-slate-900">{preview}</p>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-50"
          disabled={!form.name || !form.content || isPending}
          onClick={handleSave}
          type="button"
        >
          Guardar mensaje
        </button>
        <button
          className="rounded-md border border-slate-200 px-4 py-2 text-sm dark:border-slate-700"
          onClick={() =>
            setPreview(
              renderTemplatePreview(form.content, {
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
        <button
          className="rounded-md border border-slate-200 px-4 py-2 text-sm dark:border-slate-700"
          onClick={onClose}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
