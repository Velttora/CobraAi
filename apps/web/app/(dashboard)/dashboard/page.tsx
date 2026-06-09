"use client";

import { useAuth } from "@clerk/nextjs";
import { DashboardView } from "../../../components/dashboard/DashboardView";
import { useRedirectFromDashboardWhenNoPortfolios } from "../../../hooks/use-landing-redirect";
import { usePortfolios } from "../../../hooks/use-portfolios";
import DashboardLoading from "../loading";

export default function DashboardPage(): React.ReactElement {
  const { isLoaded, orgId } = useAuth();
  const portfoliosQuery = usePortfolios();
  const total = portfoliosQuery.data?.data.pagination.total;

  useRedirectFromDashboardWhenNoPortfolios();

  if (
    !isLoaded ||
    !orgId ||
    portfoliosQuery.isLoading ||
    (portfoliosQuery.isSuccess && total === 0)
  ) {
    return <DashboardLoading />;
  }

  return <DashboardView />;
}
