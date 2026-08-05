"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "../../lib/utils";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  tone: "danger" | "neutral";
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * `ContactModal.tsx` supplies the overlay/card chrome this component reuses,
 * but has NO dialog semantics — this adds every a11y attribute it lacks:
 * `role="dialog"`, `aria-modal`, `aria-labelledby`, initial focus on Cancel,
 * a Tab focus trap, `Escape` to close, and focus restoration to the trigger.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone,
  onConfirm,
  onClose
}: ConfirmDialogProps): React.ReactElement {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Move initial focus to Cancel (never the destructive button), and restore
  // focus to whatever triggered the dialog once it unmounts.
  useEffect(() => {
    triggerRef.current = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (!focusable || focusable.length === 0) return;
        const list = Array.from(focusable);
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        // Overlay click only dismisses a neutral dialog — a destructive
        // action must never be closeable by a stray click (T-08-16d).
        if (tone === "neutral") onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <h2 className="text-lg font-semibold" id={titleId}>
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{body}</p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
            ref={cancelRef}
            type="button"
          >
            Cancelar
          </button>
          <button
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition",
              tone === "danger"
                ? "bg-[#A32D2D] text-white hover:bg-[#8f2727]"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            )}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
