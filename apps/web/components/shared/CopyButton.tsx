"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

const COPY_FEEDBACK_MS = 2000;

export interface CopyButtonProps {
  value: string;
  label?: string;
}

/**
 * Ghost icon button that copies `value` to the clipboard. Falls back to a
 * hidden-text-node selection + `execCommand("copy")` when
 * `navigator.clipboard` is unavailable (older browsers, insecure contexts).
 * No component in this repo used the clipboard before this one (08-UI-SPEC
 * "New — shared primitives"), so there is no existing analog to extend.
 */
export function CopyButton({ value, label = "valor" }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const hiddenTextRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function fallbackCopy(): void {
    const node = hiddenTextRef.current;
    if (!node || typeof document === "undefined") return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      document.execCommand("copy");
    } finally {
      selection?.removeAllRanges();
    }
  }

  async function handleClick(): Promise<void> {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        fallbackCopy();
      }
    } else {
      fallbackCopy();
    }

    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }

  return (
    <span className="inline-flex items-center justify-center p-1">
      <button
        aria-label={`Copiar ${label}`}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition",
          "hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D85A30]/30 focus:ring-offset-1",
          "dark:text-slate-400 dark:hover:bg-slate-800"
        )}
        onClick={() => void handleClick()}
        type="button"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copiado" : ""}
      </span>
      <span className="sr-only" ref={hiddenTextRef}>
        {value}
      </span>
    </span>
  );
}
