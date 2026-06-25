"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  TEMPLATE_VARIABLE_GROUPS,
  TEMPLATE_VARIABLE_SAMPLES
} from "../../lib/template-variables";
import {
  buildRuleCondition,
  parseAgingRangeFromCondition,
  showsAgingRangeField,
  validateAgingRangeForm
} from "../../lib/workflow-rule-conditions";
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
  { value: "schedule", label: "Programado (por mora)" },
  { value: "manual", label: "Manual" }
] as const;

const TRIGGER_LABELS = Object.fromEntries(
  TRIGGERS.map((t) => [t.value, t.label])
) as Record<string, string>;

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

const DEFAULT_PAYMENT_THANK_YOU_CONTENT =
  "Hola {{nombre}}, confirmamos la recepción de su pago por {{monto}}. ¡Gracias por su compromiso! Su cuenta queda al día.";

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
}

type RuleForm = {
  name: string;
  trigger: string;
  action: string;
  channel: string;
  aging_min_days: string;
  aging_max_days: string;
  priority: string;
};

const emptyRuleForm: RuleForm = {
  name: "",
  trigger: "debt_created",
  action: "send_notification",
  channel: "",
  aging_min_days: "",
  aging_max_days: "",
  priority: ""
};

function ruleToForm(rule: WorkflowRule): RuleForm {
  const range = parseAgingRangeFromCondition(rule.condition);
  return {
    name: rule.name,
    trigger: rule.trigger,
    action: rule.action,
    channel: rule.channel ?? "",
    aging_min_days: range?.min !== undefined ? String(range.min) : "",
    aging_max_days: range?.max !== undefined ? String(range.max) : "",
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

  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);
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
    if (showsAgingRangeField(newForm.trigger)) {
      const rangeError = validateAgingRangeForm(
        newForm.aging_min_days,
        newForm.aging_max_days
      );
      if (rangeError) {
        toast.error(rangeError);
        return;
      }
    }
    createRule.mutate(
      {
        portfolio_id: portfolioId,
        name: newForm.name,
        trigger: newForm.trigger,
        action: newForm.action,
        condition: buildRuleCondition({
          trigger: newForm.trigger,
          agingMinDays: newForm.aging_min_days,
          agingMaxDays: newForm.aging_max_days
        }),
        ...(newForm.channel ? { channel: newForm.channel } : {}),
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
    if (!editingRule || !editForm.name) return;
    if (showsAgingRangeField(editingRule.trigger, editingRule.condition)) {
      const rangeError = validateAgingRangeForm(
        editForm.aging_min_days,
        editForm.aging_max_days
      );
      if (rangeError) {
        toast.error(rangeError);
        return;
      }
    }
    updateRule.mutate(
      {
        id: editingRule.id,
        name: editForm.name,
        action: editForm.action,
        condition: buildRuleCondition({
          trigger: editingRule.trigger,
          agingMinDays: editForm.aging_min_days,
          agingMaxDays: editForm.aging_max_days,
          existing: editingRule.condition
        }),
        ...(editForm.channel ? { channel: editForm.channel } : {}),
        ...(editForm.priority ? { priority: Number(editForm.priority) } : {})
      },
      { onSuccess: () => setEditingRule(null) }
    );
  }

  function startEdit(rule: WorkflowRule) {
    setEditForm(ruleToForm(rule));
    setEditingRule(rule);
    setTemplateRuleId(null);
  }

  function toggleTemplate(rule: WorkflowRule) {
    setTemplateRuleId((current) => (current === rule.id ? null : rule.id));
    setEditingRule(null);
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
          <RuleFormFields form={newForm} onChange={setNewForm} trigger={newForm.trigger} />
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
            editingRule?.id === rule.id ? (
              <li
                className="border-b border-slate-100 bg-slate-50 px-5 py-4 last:border-0 dark:border-slate-800 dark:bg-slate-950"
                key={rule.id}
              >
                <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Editando: {sanitizeChannelText(rule.name)}
                </p>
                <RuleFormFields
                  condition={rule.condition}
                  form={editForm}
                  hidesTrigger
                  onChange={setEditForm}
                  trigger={editForm.trigger || rule.trigger}
                />
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
                    onClick={() => setEditingRule(null)}
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
  trigger,
  condition,
  hidesTrigger = false
}: {
  form: RuleForm;
  onChange: (f: RuleForm) => void;
  trigger: string;
  condition?: Record<string, unknown>;
  hidesTrigger?: boolean;
}): React.ReactElement {
  const set =
    (key: keyof RuleForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...form, [key]: e.target.value });

  const showAgingRange = showsAgingRangeField(trigger, condition);
  const triggerLabel = TRIGGER_LABELS[trigger] ?? trigger;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {hidesTrigger ? (
        <div className="sm:col-span-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          <span className="text-slate-500">Disparador: </span>
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {triggerLabel}
          </span>
        </div>
      ) : null}
      {showAgingRange ? (
        <div className="sm:col-span-2 rounded-md border border-[#D85A30]/25 bg-orange-50/50 p-4 dark:border-[#D85A30]/30 dark:bg-orange-950/20">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Rango de mora (días)
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Define cuándo contactar según los días transcurridos desde el
            vencimiento de la deuda.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Desde el día
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                min="0"
                onChange={set("aging_min_days")}
                placeholder="0"
                type="number"
                value={form.aging_min_days}
              />
            </label>
            <label className="text-sm">
              Hasta el día
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                min="0"
                onChange={set("aging_max_days")}
                placeholder="30"
                type="number"
                value={form.aging_max_days}
              />
            </label>
          </div>
          <span className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
            Ejemplos: 0–30 primer mes, 31–60 segundo mes, 61–90 tercer mes.
            Deja &quot;Hasta&quot; vacío para mora sin tope (ej. desde el día 181).
          </span>
        </div>
      ) : hidesTrigger ? (
        <p className="sm:col-span-2 text-xs text-slate-500 dark:text-slate-400">
          Esta regla no usa rango de mora. Solo las reglas programadas (Aging
          0-30, 31-60, etc.) permiten configurar el rango de días.
        </p>
      ) : null}
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
            onChange={(e) => {
              const nextTrigger = e.target.value;
              const next = { ...form, trigger: nextTrigger };
              if (
                showsAgingRangeField(nextTrigger) &&
                !form.aging_min_days &&
                !form.aging_max_days
              ) {
                next.aging_min_days = "0";
                next.aging_max_days = "30";
              }
              if (nextTrigger === "payment_confirmed") {
                next.action = "send_notification";
                if (!next.channel) next.channel = "whatsapp";
              }
              onChange(next);
            }}
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
        Prioridad
        <input
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          min="0"
          max="100"
          onChange={set("priority")}
          type="number"
          value={form.priority}
        />
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          Define el orden cuando varias reglas aplican a la vez: el número más
          bajo se ejecuta primero (0 = máxima prioridad). Por defecto 100. Rango
          sugerido: 0–100.
        </span>
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

type TemplateForm = { name: string; channel: string; subject: string; content: string };

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
          subject: template.subject ?? "",
          content: template.content
        }
      : {
          name: sanitizeChannelText(rule.name),
          channel: resolveMessageChannel(rule.channel) ?? "email",
          subject: "",
          content:
            rule.trigger === "payment_confirmed"
              ? DEFAULT_PAYMENT_THANK_YOU_CONTENT
              : DEFAULT_TEMPLATE_CONTENT
        }
  );
  const [preview, setPreview] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const el = contentRef.current;
    if (!el) {
      setForm((prev) => ({ ...prev, content: `${prev.content}${token}` }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
    setForm((prev) => ({ ...prev, content: next }));
    // Reposiciona el cursor justo después de la variable insertada.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

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

    const subject =
      form.channel === "email" && form.subject.trim() ? form.subject.trim() : undefined;

    if (template) {
      updateTemplate.mutate(
        {
          id: template.id,
          name: form.name,
          channel: form.channel,
          subject,
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
        subject,
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
        {form.channel === "email" && (
          <label className="block text-sm">
            Asunto del correo
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              onChange={set("subject")}
              placeholder="Ej: Recordatorio de pago — {{empresa}}"
              value={form.subject}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Admite variables como {"{{empresa}}"} o {"{{nombre}}"}. Si lo dejas
              vacío, se usa un asunto por defecto.
            </span>
          </label>
        )}
        <label className="block text-sm">
          Contenido
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
            onChange={set("content")}
            ref={contentRef}
            value={form.content}
          />
        </label>
        <p className="text-xs text-slate-500">
          Variables usadas: {extractVariables(form.content).join(", ") || "—"}
        </p>
        <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Variables disponibles
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Haz clic en una variable para insertarla en el mensaje. Se reemplaza
            automáticamente con los datos reales de cada deudor al enviar.
          </p>
          <div className="space-y-3">
            {TEMPLATE_VARIABLE_GROUPS.map((group) => (
              <div key={group.category}>
                <p className="mb-1.5 text-[11px] font-semibold text-slate-400">
                  {group.category}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.variables.map((v) => (
                    <button
                      className="group inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs hover:border-[#D85A30] hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      title={v.label}
                      type="button"
                    >
                      <code className="font-mono text-[#D85A30]">{`{{${v.key}}}`}</code>
                      <span className="hidden text-slate-500 sm:inline">
                        · {v.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
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
            setPreview(renderTemplatePreview(form.content, TEMPLATE_VARIABLE_SAMPLES))
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
