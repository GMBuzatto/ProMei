"use client";

import { Ban, Building2, CircleAlert, CircleCheck, CircleSlash } from "lucide-react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { StatCard } from "@/components/stat-card";
import { useCompanyStats } from "../hooks";
import type { CompanyStats } from "../stats";

/**
 * Resumo das empresas por estado.
 *
 * Total vem exato da API. Ativas/Suspensas/Canceladas são contadas varrendo as páginas
 * (ver `stats.ts`), porque não existe endpoint de agregação.
 *
 * **Inadimplentes fica sem número de propósito.** Inadimplência é estado da *assinatura*
 * (`SubscriptionStatus.PAST_DUE`), não da empresa, e a API só expõe
 * `GET /subscriptions/:companyId` — uma empresa por requisição. Preencher esse card hoje
 * custaria uma chamada por empresa listada. Um número inventado ou derivado do status
 * errado seria pior que a lacuna: é justamente o card que decide quem o comercial vai cobrar.
 */
export function CompanyStatsCards() {
  const { data, isPending, error } = useCompanyStats();

  if (error) return <ApiErrorAlert error={error} />;

  return (
    <section aria-label="Resumo das empresas" className="space-y-2">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total de empresas"
          icon={Building2}
          tone="brand"
          value={data?.total}
          loading={isPending}
        />
        <StatCard
          label="Ativas"
          icon={CircleCheck}
          tone="success"
          value={data?.byStatus.ACTIVE}
          hint={percentOf(data, data?.byStatus.ACTIVE)}
          loading={isPending}
        />
        <StatCard
          label="Inadimplentes"
          icon={CircleAlert}
          tone="warning"
          unavailable="É estado da assinatura, não da empresa: veja na tela da empresa."
        />
        <StatCard
          label="Suspensas"
          icon={CircleSlash}
          tone="danger"
          value={data?.byStatus.SUSPENDED}
          hint={percentOf(data, data?.byStatus.SUSPENDED)}
          loading={isPending}
        />
        <StatCard
          label="Canceladas"
          icon={Ban}
          tone="neutral"
          value={data?.byStatus.CANCELED}
          hint={percentOf(data, data?.byStatus.CANCELED)}
          loading={isPending}
        />
      </div>

      {data?.partial ? (
        <p className="text-text-tertiary text-xs">
          Contagem por estado calculada sobre as primeiras {data.scanned} de {data.total} empresas.
        </p>
      ) : null}
    </section>
  );
}

/** Percentual sobre o total, omitido quando não há base para calcular. */
function percentOf(stats: CompanyStats | undefined, value: number | undefined): string | undefined {
  if (!stats || value === undefined || stats.total === 0) return undefined;
  return `${Math.round((value / stats.total) * 100)}% do total`;
}
