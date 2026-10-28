import type { Metadata } from "next";
import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { DashboardQuickActions } from "@/features/dashboard/components/dashboard-quick-actions";

export const metadata: Metadata = {
  title: "Dashboard · ProMei",
  description: "Atalhos do dia a dia, movimentações recentes e alertas de estoque.",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-text-secondary text-sm">O que você faz todo dia, a um clique daqui.</p>
      </header>

      <DashboardQuickActions />
      <DashboardOverview />
    </div>
  );
}
