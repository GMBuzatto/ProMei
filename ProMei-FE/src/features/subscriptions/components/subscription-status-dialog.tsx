"use client";

import { AlertTriangle } from "lucide-react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatRenewalDate } from "../renewal";
import { SUBSCRIPTION_STATUS_META, TRANSITION_COPY } from "../state";
import type { Subscription, SubscriptionStatus } from "../types";
import { useUpdateSubscriptionStatus } from "../hooks";
import { SubscriptionStatusBadge } from "./subscription-status-badge";

/**
 * Confirmação de transição de estado da assinatura (RN-12).
 *
 * Cada transição tem consequência diferente para a empresa — inadimplente corta a escrita do
 * painel (RN-13), cancelada é terminal —, então o texto é por destino, e não um "tem certeza?"
 * genérico. O diálogo mostra o estado atual ao lado do destino para quem confirma ver a
 * mudança inteira, não só o botão.
 */
export function SubscriptionStatusDialog({
  companyName,
  subscription,
  target,
  open,
  onClose,
}: {
  companyName: string;
  subscription: Subscription;
  target: SubscriptionStatus;
  open: boolean;
  onClose: () => void;
}) {
  const copy = TRANSITION_COPY[target];
  const {
    mutate: changeStatus,
    isPending,
    error,
    reset,
  } = useUpdateSubscriptionStatus(subscription.companyId);

  function handleClose() {
    if (isPending) return;
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title={copy.title}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          {copy.destructive ? (
            <span className="border-status-danger-border bg-status-danger-bg flex h-14 w-14 items-center justify-center rounded-full border">
              <AlertTriangle className="text-status-danger-icon h-6 w-6" aria-hidden="true" />
            </span>
          ) : null}

          <p className="text-foreground text-base font-medium">{copy.question}</p>
          <p className="text-text-secondary text-sm leading-relaxed">{copy.consequence}</p>
        </div>

        <div className="border-border bg-surface-subtle space-y-3 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">{companyName}</p>
            <p className="text-text-secondary text-sm">
              {subscription.plan?.name ?? "Plano não identificado"} · renova em{" "}
              {formatRenewalDate(subscription.renewsAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <SubscriptionStatusBadge status={subscription.status} />
            <span className="text-text-tertiary" aria-hidden="true">
              →
            </span>
            <SubscriptionStatusBadge status={target} />
          </div>

          <p className="text-text-tertiary text-xs leading-snug">
            {SUBSCRIPTION_STATUS_META[target].hint}
          </p>
        </div>

        <ApiErrorAlert error={error} />
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={handleClose} disabled={isPending}>
          Voltar
        </Button>
        <Button
          type="button"
          loading={isPending}
          loadingText={copy.pendingLabel}
          className={
            copy.destructive
              ? "bg-status-danger-icon hover:bg-status-danger-text active:bg-status-danger-text text-text-inverse"
              : undefined
          }
          onClick={() => changeStatus(target, { onSuccess: onClose })}
        >
          {copy.confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
