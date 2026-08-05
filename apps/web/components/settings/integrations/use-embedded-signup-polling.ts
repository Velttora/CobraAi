"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * A-10: while `active`, calls `onPoll` every 15s but only while the document
 * is visible (pausing on tab-hide, resuming on tab-show), and stops for good
 * after 10 minutes — offering the caller `timedOut` so it can render
 * `Actualizar estado` instead of silently polling forever (T-08-17f).
 */
export function useEmbeddedSignupPolling(active: boolean, onPoll: () => void): { timedOut: boolean } {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!active) {
      setTimedOut(false);
      return;
    }

    let elapsedMs = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function tick(): void {
      elapsedMs += POLL_INTERVAL_MS;
      if (elapsedMs >= POLL_TIMEOUT_MS) {
        stop();
        setTimedOut(true);
        return;
      }
      onPoll();
    }

    function start(): void {
      if (intervalId !== null) return;
      intervalId = setInterval(tick, POLL_INTERVAL_MS);
    }

    function stop(): void {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active]);

  return { timedOut };
}
