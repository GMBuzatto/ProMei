"use client";

import { AlertTriangle, Archive } from "lucide-react";
import { useState } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useDeleteItem } from "../hooks";
import type { Item, ItemRemovalOutcome } from "../types";

/**
 * Exclusão de item — RN-23.
 *
 * A regra tem dois desfechos e **quem clica não sabe qual vai acontecer**: item sem
 * movimentação é excluído; item com histórico é apenas inativado, porque o histórico é
 * imutável (RN-22) e apagar o item deixaria movimentações órfãs.
 *
 * Por isso o diálogo avisa antes que pode ser um ou outro, e depois **diz qual foi** — em vez
 * de fechar e deixar a pessoa deduzir pela listagem por que o item continua lá.
 */
export function ItemDeleteDialog({
  item,
  open,
  onClose,
  onDeleted,
}: {
  item: Item;
  open: boolean;
  onClose: () => void;
  /** Chamado quando o item saiu do banco de vez — quem estava na tela dele precisa sair. */
  onDeleted?: () => void;
}) {
  const { mutate: remove, isPending, error, reset } = useDeleteItem();
  const [outcome, setOutcome] = useState<ItemRemovalOutcome | null>(null);

  function handleClose() {
    if (isPending) return;
    reset();
    setOutcome(null);
    onClose();
  }

  if (outcome === "INACTIVATED") {
    return (
      <Dialog open={open} onClose={handleClose} title="Item inativado">
        <div className="space-y-4 text-center">
          <span className="bg-background-subtle text-text-secondary mx-auto flex h-14 w-14 items-center justify-center rounded-full">
            <Archive className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-foreground text-base font-medium">
            {item.name} foi inativado, não excluído.
          </p>
          <p className="text-text-secondary text-sm leading-relaxed">
            O item tem movimentações registradas, e o histórico de estoque não pode ficar com
            referências vazias. Ele sai do catálogo em uso e pode ser reativado quando quiser.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="button" onClick={handleClose}>
            Entendi
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Excluir item">
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="border-status-danger-border bg-status-danger-bg flex h-14 w-14 items-center justify-center rounded-full border">
            <AlertTriangle className="text-status-danger-icon h-6 w-6" aria-hidden="true" />
          </span>

          <p className="text-foreground text-base font-medium">
            Tem certeza que deseja excluir este item?
          </p>
          <p className="text-text-secondary text-sm leading-relaxed">
            Se o item já tiver movimentações de estoque, ele será <strong>inativado</strong> em vez
            de excluído. O histórico precisa continuar íntegro.
          </p>
        </div>

        <div className="border-border bg-surface-subtle rounded-lg border p-4">
          <p className="text-foreground text-sm font-semibold">{item.name}</p>
          <p className="text-text-secondary text-sm">
            SKU {item.sku} · saldo atual: {item.stock} {item.unit}
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
            remove(item.id, {
              onSuccess: (result) => {
                if (result.outcome === "DELETED") {
                  onDeleted?.();
                  onClose();
                  return;
                }
                // Inativado: o item continua existindo, então a tela explica o desfecho.
                setOutcome(result.outcome);
              },
            })
          }
        >
          Excluir item
        </Button>
      </div>
    </Dialog>
  );
}
