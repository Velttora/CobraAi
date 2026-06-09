"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  type ImportJobSnapshot,
  isImportJobFinished
} from "../lib/import-job-types";
import { parseImportJobSnapshot } from "../lib/parse-import-job";
import {
  addImportJob,
  listImportJobs,
  removeImportJob,
  replaceImportJobIdentity,
  updateImportJobSnapshot,
  type StoredImportJob
} from "../lib/import-jobs-store";

export type ImportJobProgress = StoredImportJob & ImportJobSnapshot;

type ImportJobsContextValue = {
  jobs: ImportJobProgress[];
  trackJob: (job: StoredImportJob) => void;
  getJobForPortfolio: (portfolioId: string) => ImportJobProgress | undefined;
  dismissJob: (portfolioId: string, jobId: string) => void;
  hasActiveJobForPortfolio: (portfolioId: string) => boolean;
};

const ImportJobsContext = createContext<ImportJobsContextValue | null>(null);

const POLL_INTERVAL_MS = 1500;
const POLL_FAIL_LIMIT = 6;

const SERVICE_UNAVAILABLE_MSG =
  "No se pudo consultar el progreso. Verifica que el servicio de portafolios esté activo e intenta subir el archivo de nuevo.";

type FetchResult =
  | { kind: "progress"; snapshot: ImportJobSnapshot }
  | { kind: "orphan" }
  | { kind: "unavailable" };

async function fetchActiveJobProgress(
  portfolioId: string
): Promise<ImportJobSnapshot | "missing" | null> {
  try {
    const res = await fetch(`/api/import/${portfolioId}/active`, {
      cache: "no-store"
    });
    if (res.status === 404) return "missing";
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: Record<string, unknown>;
    };
    if (!json.success || !json.data) return null;
    return parseImportJobSnapshot(json.data);
  } catch {
    return null;
  }
}

async function fetchJobProgress(
  portfolioId: string,
  jobId: string
): Promise<FetchResult> {
  try {
    const res = await fetch(`/api/import/${portfolioId}/${jobId}`, {
      cache: "no-store"
    });
    if (res.ok) {
      const json = (await res.json()) as {
        success?: boolean;
        data?: Record<string, unknown>;
      };
      if (!json.success || !json.data) return { kind: "unavailable" };
      const snapshot = parseImportJobSnapshot(json.data);
      if (!snapshot) return { kind: "unavailable" };
      return { kind: "progress", snapshot };
    }
    if (res.status === 404) {
      const active = await fetchActiveJobProgress(portfolioId);
      if (active === "missing") {
        return { kind: "orphan" };
      }
      if (active && typeof active === "object") {
        return { kind: "progress", snapshot: active };
      }
      return { kind: "unavailable" };
    }
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

function jobKey(portfolioId: string, jobId: string): string {
  return `${portfolioId}:${jobId}`;
}

function mergeJob(
  stored: StoredImportJob,
  progress: ImportJobSnapshot | null,
  fallback?: ImportJobProgress | null
): ImportJobProgress {
  if (progress) {
    return {
      ...stored,
      ...progress,
      errors: progress.errors ?? []
    };
  }
  if (fallback && !isImportJobFinished(fallback.status)) {
    return fallback;
  }
  const snapshot = stored.snapshot;
  return {
    ...stored,
    status: snapshot?.status ?? "queued",
    estimated_rows: snapshot?.estimated_rows ?? 0,
    processed_rows: snapshot?.processed_rows ?? 0,
    success_rows: snapshot?.success_rows ?? 0,
    error_rows: snapshot?.error_rows ?? 0,
    errors: snapshot?.errors ?? [],
    failure_message: snapshot?.failure_message ?? null
  };
}

function buildUnreachableSnapshot(
  fallback: ImportJobProgress
): ImportJobSnapshot {
  return {
    status: "failed",
    estimated_rows: fallback.estimated_rows,
    processed_rows: fallback.processed_rows,
    success_rows: fallback.success_rows,
    error_rows: fallback.error_rows,
    errors: [SERVICE_UNAVAILABLE_MSG],
    failure_message: SERVICE_UNAVAILABLE_MSG
  };
}

function shouldPollJob(fallback: ImportJobProgress | undefined): boolean {
  if (!fallback) return true;
  return !isImportJobFinished(fallback.status);
}

export function ImportJobsProvider({
  children
}: {
  children: ReactNode;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<ImportJobProgress[]>(() =>
    listImportJobs().map((job) => mergeJob(job, job.snapshot ?? null))
  );
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const notifiedRef = useRef<Set<string>>(
    new Set(
      listImportJobs()
        .filter((job) => job.snapshot && isImportJobFinished(job.snapshot.status))
        .map((job) => jobKey(job.portfolioId, job.jobId))
    )
  );
  const pollFailRef = useRef<Map<string, number>>(new Map());
  const trackJob = useCallback((job: StoredImportJob) => {
    pollFailRef.current.delete(jobKey(job.portfolioId, job.jobId));
    addImportJob(job);
    setJobs((current) => [
      mergeJob(job, job.snapshot ?? null),
      ...current.filter((item) => item.portfolioId !== job.portfolioId)
    ]);
  }, []);

  const dismissJob = useCallback((portfolioId: string, jobId: string) => {
    pollFailRef.current.delete(jobKey(portfolioId, jobId));
    removeImportJob(portfolioId, jobId);
    setJobs((current) =>
      current.filter(
        (item) => !(item.portfolioId === portfolioId && item.jobId === jobId)
      )
    );
  }, []);

  const getJobForPortfolio = useCallback(
    (portfolioId: string) => jobs.find((job) => job.portfolioId === portfolioId),
    [jobs]
  );

  const hasActiveJobForPortfolio = useCallback(
    (portfolioId: string) => {
      const job = jobs.find((item) => item.portfolioId === portfolioId);
      return Boolean(job && !isImportJobFinished(job.status));
    },
    [jobs]
  );

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const stored = listImportJobs();
      if (stored.length === 0) {
        if (!cancelled) setJobs([]);
        return;
      }

      const prev = jobsRef.current;
      const results = await Promise.all(
        stored.map(async (job) => {
          const key = jobKey(job.portfolioId, job.jobId);
          const fallback = prev.find(
            (p) => p.portfolioId === job.portfolioId && p.jobId === job.jobId
          );

          if (!shouldPollJob(fallback)) {
            return fallback ?? mergeJob(job, job.snapshot ?? null);
          }

          const result = await fetchJobProgress(job.portfolioId, job.jobId);

          if (result.kind === "orphan") {
            removeImportJob(job.portfolioId, job.jobId);
            pollFailRef.current.delete(key);
            return null;
          }

          let progress: ImportJobSnapshot | null =
            result.kind === "progress" ? result.snapshot : null;

          if (
            progress?.job_id &&
            progress.job_id !== job.jobId
          ) {
            replaceImportJobIdentity(
              job.portfolioId,
              job.jobId,
              progress.job_id,
              progress
            );
            job = {
              ...job,
              jobId: progress.job_id,
              snapshot: progress
            };
          }

          if (progress) {
            pollFailRef.current.delete(key);
          } else if (fallback) {
            const fails = (pollFailRef.current.get(key) ?? 0) + 1;
            pollFailRef.current.set(key, fails);
            if (fails >= POLL_FAIL_LIMIT) {
              progress = buildUnreachableSnapshot(fallback);
            }
          }

          const merged = mergeJob(job, progress, fallback);
          if (progress && isImportJobFinished(progress.status)) {
            updateImportJobSnapshot(
              merged.portfolioId,
              merged.jobId,
              progress
            );
          }
          return merged;
        })
      );

      const nextJobs = results.filter(
        (job): job is ImportJobProgress => job !== null
      );

      if (cancelled) return;
      jobsRef.current = nextJobs;
      setJobs(nextJobs);

      for (const job of nextJobs) {
        const key = jobKey(job.portfolioId, job.jobId);
        if (!isImportJobFinished(job.status)) continue;
        if (notifiedRef.current.has(key)) continue;

        notifiedRef.current.add(key);
        pollFailRef.current.delete(key);

        void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
        void queryClient.invalidateQueries({
          queryKey: ["portfolio", job.portfolioId]
        });
        void queryClient.invalidateQueries({
          queryKey: ["portfolio-stats", job.portfolioId]
        });
        void queryClient.invalidateQueries({ queryKey: ["debts"] });

        const label = job.portfolioName ?? "Portafolio";
        if (job.status === "failed") {
          toast.error(
            job.failure_message ??
              `Importación detenida en ${label}. Revisa el resumen e intenta de nuevo.`
          );
        } else if (job.status === "completed") {
          toast.success(
            `Lectura completada en ${label}: ${job.success_rows} filas importadas${
              job.error_rows > 0 ? `, ${job.error_rows} con error` : ""
            }`
          );
        }
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      const stored = listImportJobs();
      if (stored.length === 0) return;

      const shouldPoll = stored.some((job) => {
        const current = jobsRef.current.find(
          (j) => j.portfolioId === job.portfolioId && j.jobId === job.jobId
        );
        return shouldPollJob(current);
      });

      if (shouldPoll) {
        void poll();
      }
    }, POLL_INTERVAL_MS);

    const onVisibility = (): void => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({
      jobs,
      trackJob,
      getJobForPortfolio,
      dismissJob,
      hasActiveJobForPortfolio
    }),
    [dismissJob, getJobForPortfolio, hasActiveJobForPortfolio, jobs, trackJob]
  );

  return (
    <ImportJobsContext.Provider value={value}>
      {children}
    </ImportJobsContext.Provider>
  );
}

export function useImportJobs(): ImportJobsContextValue {
  const ctx = useContext(ImportJobsContext);
  if (!ctx) {
    throw new Error("useImportJobs debe usarse dentro de ImportJobsProvider");
  }
  return ctx;
}
