import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AuthGuard } from "@/features/auth/components/auth-guard";

/**
 * Layout de todas as rotas autenticadas. O `AuthGuard` fica dentro do shell de propósito:
 * sidebar e header não são conteúdo protegido, então aparecem de imediato enquanto só a
 * área de conteúdo espera a verificação de sessão.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell>
      <AuthGuard>{children}</AuthGuard>
    </DashboardShell>
  );
}
