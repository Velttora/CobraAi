"use client";

import { useState } from "react";
import {
  formatWorkflowChannel,
  useCreateWorkflowRule,
  useDeleteWorkflowRule,
  useToggleWorkflowRule,
  useUpdateWorkflowRule,
  useWorkflowRules,
  type WorkflowRule
} from "../../hooks/use-workflows";

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
  const toggleRule = useToggleWorkflowRule(portfolioId);
  const deleteRule = useDeleteWorkflowRule(portfolioId);
  const createRule = useCreateWorkflowRule(portfolioId);
  const updateRule = useUpdateWorkflowRule(portfolioId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<RuleForm>(emptyRuleForm);
  const [editForm, setEditForm] = useState<RuleForm>(emptyRuleForm);

  const rules = rulesQuery.data?.data ?? [];
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
        {portfolioId && (
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

      {showNew && (
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
          Sin reglas. Usa &ldquo;+ Nueva regla&rdquo; para crear la primera.
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
                  Editando: {rule.name}
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
              <RuleRow
                isPending={isPending}
                key={rule.id}
                onDelete={() => deleteRule.mutate(rule.id)}
                onEdit={() => startEdit(rule)}
                onToggle={(id, isActive) => toggleRule.mutate({ id, isActive })}
                rule={rule}
              />
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
  isPending,
  onToggle,
  onEdit,
  onDelete
}: {
  rule: WorkflowRule;
  isPending: boolean;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}): React.ReactElement {
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 last:border-0 dark:border-slate-800 ${!rule.isActive ? "opacity-50" : ""}`}
    >
      <div>
        <p className="font-medium text-slate-900 dark:text-slate-100">{rule.name}</p>
        <p className="text-xs text-slate-500">
          {rule.trigger} → {rule.action}
          {rule.channel ? ` · ${formatWorkflowChannel(rule.channel)}` : ""}
          {rule.delayHours ? ` · ${rule.delayHours}h` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
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
    </li>
  );
}
