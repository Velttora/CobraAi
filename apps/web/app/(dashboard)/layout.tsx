import { Sidebar } from "../../components/shared/Sidebar";
import { Topbar } from "../../components/shared/Topbar";
import { DashboardProviders } from "../../components/providers/DashboardProviders";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <DashboardProviders>
      <div className="flex min-h-screen bg-[#FAFAFA] text-slate-900 dark:bg-[#0A0806] dark:text-slate-100">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </DashboardProviders>
  );
}
