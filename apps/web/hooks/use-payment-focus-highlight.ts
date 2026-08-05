"use client";

import { useEffect, useRef, useState } from "react";

/**
 * `?focus=payments` deep-link contract (08-16-SUMMARY.md): scrolls the
 * matching panel into view and applies a 2s highlight ring when the query
 * param matches, gated on `prefers-reduced-motion` for both the scroll
 * behavior and the ring transition (the caller applies
 * `motion-reduce:ring-0` on the returned `highlighted` flag).
 */
export function usePaymentFocusHighlight(focusParam: string | null): {
  ref: React.RefObject<HTMLElement>;
  highlighted: boolean;
} {
  const ref = useRef<HTMLElement>(null);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    if (focusParam !== "payments") return;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    setHighlighted(true);
    const timer = setTimeout(() => setHighlighted(false), 2000);
    return () => clearTimeout(timer);
  }, [focusParam]);

  return { ref, highlighted };
}
