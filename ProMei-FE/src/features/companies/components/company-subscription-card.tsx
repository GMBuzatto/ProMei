"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { API_MAX_PAGE_SIZE } from "@/lib/pagination";
import { usePermissions } from "@/features/auth/use-permissions";
import { formatPriceWithPeriod } from "@/features/plans/format";
import { usePlans } from "@/features/plans/hooks";
import type { Plan } from "@/features/plans/types";
import { SubscriptionStatusBadge } from "@/features/subscriptions/components/subscription-status-badge";
import { SubscriptionStatusDialog } from "@/features/subscriptions/components/subscription-status-dialog";
import { useCompanySubscription } from "@/features/subscriptions/hooks";
import { formatRenewalDate } from "@/features/subscriptions/renewal";
import { allowedTransitions, TRANSITION_COPY } from "@/features/subscriptions/state";
import type { SubscriptionStatus } from "@/features/subscriptions/types";
import type { Company } from "../types";

/**
 * Plano contratado, na tela de detalhes.
 *
 * Mostra o que a empresa contratou e deixa mudar o **estado** da assinatura ali mesmo — as
 * transições da RN-12 são a resposta para "esta empresa pagou?", e quem está olhando a
 * empresa é quem faz essa pergunta. Trocar de **plano** continua sendo na tela de edição:
 * é outra rota, outra permissão e outro tipo de decisão.
 */
export function CompanySubscriptionCard({ company }: { company: Company }) {
  // Mesma exigência do editor de plano: sem permissão de assinatura, o card não existe.
  const canRead = usePermissions(["subscriptions:read", "subscriptions:update"]);
  const [pendingTransition, setPendingTransition] = useState<SubscriptionStatus | null>(null);

  const subscriptionQuery = useCompanySubscription(company.id, { enabled: canRead });
  const subscription = subscriptionQuery.data ?? null;

  // A API já embute o plano na assinatura; a listagem é só o plano B, e não vale uma
  // requisição em toda visita à tela.
  const plansQuery = usePlans(
    { limit: API_MAX_PAGE_SIZE },
    { enabled: canRead && subscription !== null && subscription.plan === undefined },
  );

  if (!canRead) return null;

  const plan =
    subscription?.plan ??
    plansQuery.data?.data.find((candidate: Plan) => candidate.id === subscription?.planId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plano e assinatura</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {subscriptionQuery.isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">Carregando assinatura...</span>
            <div className="bg-background-subtle h-24 animate-pulse rounded-md" />
          </div>
        ) : null}

        <ApiErrorAlert error={subscriptionQuery.error} />

        {subscription ? (
          <dl className="divide-border divide-y">
            <SummaryRow label="Plano" value={plan?.name} />
            <SummaryRow label="Valor" value={plan ? formatPriceWithPeriod(plan) : undefined} />
            <SummaryRow label="Situação">
              <SubscriptionStatusBadge status={subscription.status} />
            </SummaryRow>
            <SummaryRow
              label="Próxima renovação"
              value={formatRenewalDate(subscription.renewsAt)}
            />
          </dl>
        ) : null}

        {subscription ? (
          <SubscriptionTransitions status={subscription.status} onSelect={setPendingTransition} />
        ) : null}

        {!subscriptionQuery.isPending && !subscriptionQuery.error && !subscription ? (
          <div className="space-y-3">
            <p className="text-text-secondary text-sm">
              Esta empresa ainda não tem assinatura. Sem plano vinculado o acesso segue normal: é
              um estado de provisionamento, não inadimplência.
            </p>

            <PermissionGate permissions="subscriptions:create">
              <Link
                href={`/companies/${company.id}/edit`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Vincular plano
              </Link>
            </PermissionGate>
          </div>
        ) : null}
      </CardContent>

      {subscription && pendingTransition ? (
        <SubscriptionStatusDialog
          companyName={company.name}
          subscription={subscription}
          target={pendingTransition}
          open
          onClose={() => setPendingTransition(null)}
        />
      ) : null}
    </Card>
  );
}

/**
 * Botões das transições possíveis a partir do estado atual (RN-12).
 *
 * `CANCELED` é terminal: em vez de um botão morto, a tela diz por que não há ação.
 */
function SubscriptionTransitions({
  status,
  onSelect,
}: {
  status: SubscriptionStatus;
  onSelect: (target: SubscriptionStatus) => void;
}) {
  const transitions = allowedTransitions(status);

  if (transitions.length === 0) {
    return (
      <p className="text-text-secondary text-sm">
        Assinatura cancelada: estado terminal. Retomar exige uma nova assinatura.
      </p>
    );
  }

  return (
    <PermissionGate permissions="subscriptions:update">
      <div className="flex flex-wrap gap-2">
        {transitions.map((target) => (
          <Button
            key={target}
            variant="secondary"
            size="sm"
            className={
              TRANSITION_COPY[target].destructive
                ? "border-status-danger-border text-status-danger-text hover:bg-status-danger-bg"
                : undefined
            }
            onClick={() => onSelect(target)}
          >
            {TRANSITION_COPY[target].action}
          </Button>
        ))}
      </div>
    </PermissionGate>
  );
}

function SummaryRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <dt className="text-text-secondary text-sm">{label}</dt>
      <dd className="text-foreground text-sm font-medium">{children ?? value ?? "-"}</dd>
    </div>
  );
}
