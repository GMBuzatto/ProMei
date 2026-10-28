"use client";

import { AlertTriangle } from "lucide-react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatPriceWithPeriod } from "../format";
import { useDeletePlan } from "../hooks";
import type { Plan } from "../types";

/**
 * Confirmação de exclusão de plano.
 *
 * A API recusa com 409 quando existe assinatura vinculada ("Plano não pode ser excluído")
 * — o histórico de cobrança precisa continuar legível. O aviso aparece antes de clicar, mas
 * quem decide é a API: só ela sabe se alguma empresa assina este plano agora.
 */
export function PlanDeleteDialog({
  plan,
  open,
  onClose,
  onDeleted,
}: {
  plan: Plan;
  open: boolean;
  onClose: () => void;
  /**
   * Chamado depois da exclusão confirmada. Quem abriu o diálogo decide para onde ir — quem
   * excluiu a partir da tela do próprio plano não pode continuar nela.
   */
  onDeleted?: () => void;
}) {
  const { mutate: remove, isPending, error, reset } = useDeletePlan();

  function handleClose() {
    if (isPending) return;
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Excluir plano">
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="border-status-danger-border bg-status-danger-bg flex h-14 w-14 items-center justify-center rounded-full border">
            <AlertTriangle className="text-status-danger-icon h-6 w-6" aria-hidden="true" />
          </span>

          <p className="text-foreground text-base font-medium">
            Tem certeza que deseja excluir este plano?
          </p>
          <p className="text-text-secondary text-sm leading-relaxed">
            Planos com assinatura vinculada não podem ser excluídos. Nesse caso, edite o plano ou
            migre as empresas para outro antes.
          </p>
        </div>

        <div className="border-border bg-surface-subtle rounded-lg border p-4">
          <p className="text-foreground text-sm font-semibold">{plan.name}</p>
          <p className="text-text-secondary text-sm">
            {formatPriceWithPeriod(plan)} · {plan.limits.maxUsers} usuários · {plan.limits.maxItems}{" "}
            itens
          </p>
        </div>

        <ApiErrorAlert error={error} />
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={handleClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button
          type="button"
          loading={isPending}
          loadingText="Excluindo..."
          className="bg-status-danger-icon hover:bg-status-danger-text active:bg-status-danger-text text-text-inverse"
          onClick={() =>
            remove(plan.id, {
              onSuccess: () => {
                onDeleted?.();
                onClose();
              },
            })
          }
        >
          Excluir plano
        </Button>
      </div>
    </Dialog>
  );
}
