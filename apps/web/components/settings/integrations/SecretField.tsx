"use client";

import { useEffect, useRef, useState } from "react";
import type { IntegrationSecretMeta } from "../../../lib/types";
import { cn } from "../../../lib/utils";

export interface SecretFieldProps {
  label: string;
  name: string;
  meta: IntegrationSecretMeta | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}

/**
 * The D-26 write-only secret field. The stored secret is NEVER rendered,
 * never in the DOM, never in a `value` attribute serialized to markup, never
 * in a React Query cache — the API returns only `lastFour` + `savedAt`
 * (T-08-08, T-08-16b).
 *
 * The password `<input>` below is deliberately UNCONTROLLED (no `value`
 * prop, only an empty `defaultValue`): React sets an `<input>`'s "value"
 * content attribute once at mount for a controlled component's live prop,
 * which is exactly what would leak a typed secret into `container.innerHTML`
 * on every keystroke. Left uncontrolled, the attribute stays frozen at its
 * initial (empty) value while the user types — the plaintext only ever
 * exists as the input node's live IDL property, which `innerHTML` never
 * serializes. Only the CHARACTER COUNT (a number, never the string) is kept
 * in React state/render output.
 *
 * Four states (08-UI-SPEC.md "Write-only secret field (D-26)"):
 * - Empty: no `meta` — an editable, empty password input.
 * - Filled: `meta` present, not rotating — no input at all, `lastFour` only.
 * - Rotating: user clicked "Reemplazar" — an empty, autofocused input.
 * - Verifying: `disabled` while rotating — input disabled, save in flight.
 */
export function SecretField({
  label,
  name,
  meta,
  disabled = false,
  onChange
}: SecretFieldProps): React.ReactElement {
  const [rotating, setRotating] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevSavedAt = useRef<string | null>(meta?.savedAt ?? null);

  // A typed secret must never linger after this field leaves the tree.
  useEffect(() => {
    return () => {
      if (inputRef.current) inputRef.current.value = "";
    };
  }, []);

  // A successful save surfaces as a new `savedAt` on the persisted meta —
  // when that happens, drop back to the read-only Filled state and clear the
  // input's live value. This is the only "did the save succeed" signal this
  // component gets, since it takes no isSaving/onSave prop by design.
  useEffect(() => {
    const savedAt = meta?.savedAt ?? null;
    if (savedAt !== prevSavedAt.current) {
      prevSavedAt.current = savedAt;
      if (rotating) {
        setRotating(false);
        setCharCount(0);
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  }, [meta?.savedAt, rotating]);

  useEffect(() => {
    if (rotating) inputRef.current?.focus();
  }, [rotating]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const next = e.target.value;
    setCharCount(next.length);
    onChange(next.trim() === "" ? null : next);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>): void {
    const trimmed = e.target.value.trim();
    if (trimmed !== e.target.value) {
      e.target.value = trimmed;
      setCharCount(trimmed.length);
      onChange(trimmed === "" ? null : trimmed);
    }
  }

  const inputId = `secret-${name}`;
  const hintId = `${inputId}-hint`;
  const isFilled = Boolean(meta) && !rotating;

  if (isFilled && meta) {
    return (
      <div className="space-y-1">
        <span className="block text-sm font-medium">{label}</span>
        <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
          <span
            aria-label={`Llave secreta terminada en ${meta.lastFour}`}
            className="font-mono text-sm text-slate-700 dark:text-slate-300"
          >
            •••• •••• •••• {meta.lastFour}
          </span>
          <button
            className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            disabled={disabled}
            onClick={() => setRotating(true)}
            type="button"
          >
            Reemplazar
          </button>
        </div>
        {meta.savedAt && (
          <p className="text-xs text-slate-500">Guardada el {formatSavedAt(meta.savedAt)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" htmlFor={inputId}>
        {label}
        <input
          aria-describedby={hintId}
          autoComplete="off"
          className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
          data-1p-ignore
          defaultValue=""
          disabled={disabled}
          id={inputId}
          key={rotating ? "rotating" : "empty"}
          onBlur={handleBlur}
          onChange={handleChange}
          placeholder="Pega tu llave secreta"
          ref={inputRef}
          spellCheck={false}
          type="password"
        />
      </label>
      <p
        className={cn(
          "text-xs",
          rotating ? "text-amber-700 dark:text-amber-400" : "text-slate-500"
        )}
        id={hintId}
      >
        {rotating
          ? "Al guardar, la llave anterior deja de funcionar de inmediato."
          : "Se guarda cifrada. No la volveremos a mostrar."}
      </p>
      {charCount > 0 && <p className="text-xs text-slate-500">{charCount} caracteres</p>}
      {rotating && (
        <button
          className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          disabled={disabled}
          onClick={() => {
            setRotating(false);
            setCharCount(0);
            onChange(null);
          }}
          type="button"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
}
