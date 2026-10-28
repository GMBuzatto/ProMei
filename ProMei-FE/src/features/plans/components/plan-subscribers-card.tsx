"use client";

import { Building2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscriptionStatusBadge } from "@/features/subscriptions/components/subscription-status-badge";
import { formatRenewalDate } from "@/features/subscriptions/renewal";
import { cn } from "@/lib/utils";
import { usePlanSubscribers } from "../hooks";
import type { Plan } from "../types";

/**
 * Empresas que assinam o plano, da renovação mais próxima para a mais distante.
 *
 * A ordem é o ponto da tela: quem abre isto quer saber quem renova primeiro. A lista é
 * montada no cliente porque a API não cruza plano e assinatura — ver `subscribers.ts`, que
 * também explica o teto de empresas consultadas.
 */
export function PlanSubscribersCard({ plan }: { plan: Plan }) {
  const { data, isPending, error } = usePlanSubscribers(plan.id);

  const subscribers = data?.subscribers ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Empresas neste plano</CardTitle>
        <p className="text-text-secondary text-sm">
          Ordenadas pela próxima renovação, da mais próxima para a mais distante.
        </p>
      </CardHeader>

      {error ? (
        <CardContent>
          <ApiErrorAlert error={error} />
        </CardContent>
      ) : null}

      {isPending ? (
        <CardContent>
          <div role="status" aria-busy="true" className="space-y-3">
            <span className="sr-only">Carregando empresas deste plano...</span>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="bg-background-subtle h-10 animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      ) : null}

      {!isPending && !error && subscribers.length === 0 ? (
        <CardContent>
          <EmptyState />
        </CardContent>
      ) : null}

      {subscribers.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-border border-t border-b">
                <Th>Empresa</Th>
                <Th>Plano atual</Th>
                <Th>Próxima renovação</Th>
                <Th>Situação</Th>
              </tr>
            </thead>

            <tbody>
              {subscribers.map(({ company, subscription }) => (
                <tr
                  key={company.id}
                  className="border-border hover:bg-surface-hover border-b transition-colors last:border-b-0 motion-reduce:transition-none"
                >
                  <Td>
                    <Link
                      href={`/companies/${company.id}`}
                      className="text-foreground hover:text-text-brand font-medium transition-colors motion-reduce:transition-none"
                    >
                      {company.name}
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-text-secondary">
                      {subscription.plan?.name ?? plan.name}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-foreground tabular-nums">
                      {formatRenewalDate(subscription.renewsAt)}
                    </span>
                  </Td>
                  <Td>
                    <SubscriptionStatusBadge status={subscription.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data ? <ScanNotice data={data} count={subscribers.length} /> : null}
    </Card>
  );
}

/**
 * O rodapé conta como a lista foi obtida.
 *
 * Sem isso, uma lista curta por causa do teto de varredura passaria por "só estas empresas
 * assinam este plano" — que é exatamente a conclusão errada para quem decide cobrança.
 */
function ScanNotice({
  data,
  count,
}: {
  data: { inspected: number; total: number; partial: boolean; failed: number };
  count: number;
}) {
  return (
    <div className="border-border text-text-tertiary space-y-1 border-t px-4 py-3 text-xs">
      <p>
        {count} {count === 1 ? "empresa encontrada" : "empresas encontradas"} entre as{" "}
        {data.inspected} consultadas
        {data.total > data.inspected ? ` de ${data.total} cadastradas` : ""}.
      </p>

      {data.partial ? (
        <p>
          A API não filtra empresas por plano, então a busca consulta uma empresa por vez e para no
          limite de requisições. Pode haver mais empresas neste plano.
        </p>
      ) : null}

      {data.failed > 0 ? (
        <p>
          {data.failed} {data.failed === 1 ? "empresa não pôde" : "empresas não puderam"} ser
          consultada{data.failed === 1 ? "" : "s"}. A lista pode estar incompleta.
        </p>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="bg-background-subtle text-text-tertiary flex h-12 w-12 items-center justify-center rounded-full">
        <Building2 className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-foreground text-sm font-medium">Nenhuma empresa está usando este plano</p>
      <p className="text-text-secondary max-w-prose text-sm">
        Quando uma empresa assinar este plano, ela aparece aqui, ordenada pela data da próxima
        renovação.
      </p>
    </div>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "text-text-secondary px-4 py-3 text-xs font-medium tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 text-sm", className)}>{children}</td>;
}
