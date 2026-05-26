"use client";

import type { ReactNode } from "react";
import { ImportJobsProvider } from "../../contexts/ImportJobsContext";

export function DashboardProviders({
  children
}: {
  children: ReactNode;
}): React.ReactElement {
  return <ImportJobsProvider>{children}</ImportJobsProvider>;
}
