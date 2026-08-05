"use client";

import { EXTERNAL_LINK_VARIABLES, resolveExternalLinkTemplate, validateExternalLinkTemplate } from "@cobrai/utils";
import { useId, useLayoutEffect, useRef } from "react";
import { useDebounce } from "../../../hooks/use-debounce";

export interface ExternalLinkTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Sample debt used to render the live preview (08-UI-SPEC.md "ExternalLinkTemplateEditor (D-13)"). */
const SAMPLE_VALUES = { monto: "450000", ref: "FAC-00123", nombre: "María Rodríguez" };

/**
 * D-13: the tenant-authored `external_link` payment template editor.
 *
 * Deliberately does NOT reuse the repo's OTHER, pre-existing double-brace
 * (`{{variable}}`) preview helper in `apps/web/lib` — that resolver would
 * silently fail to substitute this screen's single-brace
 * (`{monto}`/`{ref}`/`{nombre}`) tokens (UI-SPEC assumption A-07).
 * Validation and resolution both come from
 * `@cobrai/utils` — the exact module plan 08-09's checkout gateway uses —
 * so preview output and production output cannot diverge.
 */
export function ExternalLinkTemplateEditor({
  value,
  onChange,
  disabled = false
}: ExternalLinkTemplateEditorProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const debouncedValue = useDebounce(value, 300);

  const errors = validateExternalLinkTemplate(value);
  const preview = resolveExternalLinkTemplate(debouncedValue, SAMPLE_VALUES);

  // Restores the caret after a chip insertion. Runs post-render (once the
  // controlled `value` prop has actually reached the DOM node) rather than
  // synchronously inside the click handler, where the input would still
  // hold its pre-insertion text.
  useLayoutEffect(() => {
    if (pendingCaretRef.current !== null && inputRef.current) {
      const caret = pendingCaretRef.current;
      inputRef.current.setSelectionRange(caret, caret);
      pendingCaretRef.current = null;
    }
  }, [value]);

  function insertVariable(name: string): void {
    const input = inputRef.current;
    const token = `{${name}}`;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    pendingCaretRef.current = start + token.length;
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    input?.focus();
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={inputId}>
        Plantilla del enlace de pago
        <input
          aria-describedby={errors.length > 0 ? errorId : undefined}
          aria-invalid={errors.length > 0}
          className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
          disabled={disabled}
          id={inputId}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://checkout.tuempresa.com/pagar?ref={ref}&valor={monto}"
          ref={inputRef}
          type="text"
          value={value}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Variables disponibles:</span>
        {EXTERNAL_LINK_VARIABLES.map((variable) => (
          <button
            className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 hover:bg-[#D85A30]/10 hover:text-[#D85A30] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300"
            disabled={disabled}
            key={variable}
            onClick={() => insertVariable(variable)}
            type="button"
          >
            {`{${variable}}`}
          </button>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1" id={errorId}>
          {errors.map((err) => (
            <li className="text-xs text-[#A32D2D]" key={`${err.code}-${err.variable ?? ""}`}>
              {err.message}
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite">
        <p className="text-xs text-slate-500">Vista previa con una deuda de ejemplo:</p>
        <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">{preview}</p>
      </div>

      <p className="text-xs text-slate-500">Los valores se codifican para la URL automáticamente.</p>
    </div>
  );
}
