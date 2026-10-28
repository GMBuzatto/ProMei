"use client";

import { PermissionGate } from "@/features/auth/components/permission-gate";
import { useIsPlatformUser } from "@/features/auth/use-permissions";
import { RecentMovements } from "./recent-movements";
import { StockAlerts } from "./stock-alerts";

/**
 * O resumo do dia da empresa: o que acabou de se mover e o que está faltando.
 *
 * **Só para usuário de empresa.** Super Admin/Staff não têm empresa (RN-05), e itens e
 * movimentações são rotas de tenant — para eles a API responde 404, então o resumo não existe
 * em vez de existir vazio. É a mesma fronteira que separa os atalhos em
 * `DashboardQuickActions`.
 *
 * As duas consultas são independentes e disparam juntas: nenhuma espera a outra, o que
 * mantém o carregamento em uma volta de rede só (aceite: < 2s com dados de teste). Cada card
 * tem seu próprio esqueleto e seu próprio erro — uma API lenta para itens não segura as
 * movimentações na tela.
 */
export function DashboardOverview() {
  const isPlatformUser = useIsPlatformUser();
  if (isPlatformUser) return null;

  return (
    <section aria-label="Resumo do dia" className="grid items-start gap-4 lg:grid-cols-2">
      <PermissionGate permissions="stock-movements:read">
        <RecentMovements />
      </PermissionGate>

      <PermissionGate permissions="items:read">
        <StockAlerts />
      </PermissionGate>
    </section>
  );
}
