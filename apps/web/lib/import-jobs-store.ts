export type StoredImportJob = {
  portfolioId: string;
  jobId: string;
  portfolioName?: string;
  fileName?: string;
  startedAt: string;
};

const STORAGE_KEY = "cobrai-import-jobs";

function readJobs(): StoredImportJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredImportJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJobs(jobs: StoredImportJob[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function listImportJobs(): StoredImportJob[] {
  return readJobs();
}

export function getImportJobForPortfolio(
  portfolioId: string
): StoredImportJob | undefined {
  return readJobs().find((job) => job.portfolioId === portfolioId);
}

export function addImportJob(job: StoredImportJob): void {
  const jobs = readJobs().filter(
    (existing) =>
      !(
        existing.portfolioId === job.portfolioId &&
        existing.jobId === job.jobId
      )
  );
  writeJobs([job, ...jobs]);
}

export function removeImportJob(portfolioId: string, jobId: string): void {
  writeJobs(
    readJobs().filter(
      (job) => !(job.portfolioId === portfolioId && job.jobId === jobId)
    )
  );
}
