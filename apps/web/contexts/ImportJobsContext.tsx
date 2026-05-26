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
  addImportJob,
  listImportJobs,
  removeImportJob,
  type StoredImportJob
} from "../lib/import-jobs-store";

type JobSnapshot = {
  status: string;
  processed_rows: number;
  success_rows: number;
  error_rows: number;
  estimated_rows?: number;
};

export type ImportJobProgress = StoredImportJob & JobSnapshot;

type ImportJobsContextValue = {
  jobs: ImportJobProgress[];
  trackJob: (job: StoredImportJob) => void;
  getJobForPortfolio: (portfolioId: string) => ImportJobProgress | undefined;
};

const ImportJobsContext = createContext<ImportJobsContextValue | null>(null);

async function fetchJobProgress(
  portfolioId: string,
  jobId: string
): Promise<JobSnapshot | null> {
  const res = await fetch(`/api/import/${portfolioId}/${jobId}`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: JobSnapshot;
  };
  return json.data ?? null;
}

export function ImportJobsProvider({
  children
}: {
  children: ReactNode;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<ImportJobProgress[]>(() =>
    listImportJobs().map((job) => ({
      ...job,
      status: "queued",
      processed_rows: 0,
      success_rows: 0,
      error_rows: 0,
      estimated_rows: 0
    }))
  );
  const notifiedRef = useRef<Set<string>>(new Set());

  const trackJob = useCallback((job: StoredImportJob) => {
    addImportJob(job);
    setJobs((current) => {
      const withoutDup = current.filter(
        (item) =>
          !(
            item.portfolioId === job.portfolioId && item.jobId === job.jobId
          )
      );
      return [
        {
          ...job,
          status: "queued",
          processed_rows: 0,
          success_rows: 0,
          error_rows: 0,
          estimated_rows: 0
        },
        ...withoutDup
      ];
    });
  }, []);

  const getJobForPortfolio = useCallback(
    (portfolioId: string) => jobs.find((job) => job.portfolioId === portfolioId),
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

      const nextJobs = await Promise.all(
        stored.map(async (job) => {
          const progress = await fetchJobProgress(job.portfolioId, job.jobId);
          return {
            ...job,
            status: progress?.status ?? "queued",
            processed_rows: progress?.processed_rows ?? 0,
            success_rows: progress?.success_rows ?? 0,
            error_rows: progress?.error_rows ?? 0,
            estimated_rows: progress?.estimated_rows ?? 0
          };
        })
      );

      if (cancelled) return;
      setJobs(nextJobs);

      for (const job of nextJobs) {
        const key = `${job.portfolioId}:${job.jobId}`;
        if (!["completed", "failed"].includes(job.status)) continue;
        if (notifiedRef.current.has(key)) continue;

        notifiedRef.current.add(key);
        removeImportJob(job.portfolioId, job.jobId);

        void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
        void queryClient.invalidateQueries({
          queryKey: ["portfolio", job.portfolioId]
        });
        void queryClient.invalidateQueries({
          queryKey: ["portfolio-stats", job.portfolioId]
        });
        void queryClient.invalidateQueries({ queryKey: ["debts"] });

        const label = job.portfolioName ?? "Portafolio";
        if (job.status === "completed") {
          toast.success(
            `Importación completada en ${label}: ${job.success_rows} filas OK${
              job.error_rows > 0 ? `, ${job.error_rows} errores` : ""
            }`
          );
        } else {
          toast.error(`Importación fallida en ${label}`);
        }
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, document.hidden ? 4000 : 2000);

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
    () => ({ jobs, trackJob, getJobForPortfolio }),
    [getJobForPortfolio, jobs, trackJob]
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
