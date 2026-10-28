"use client";

import { ArrowDownToLine, ArrowUpFromLine, ArrowRight, History, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signedQuantity } from "@/features/inventory/history";
import { useStockMovements } from "@/features/inventory/hooks";
import { MOVEMENT_TYPE_META } from "@/features/inventory/movement";
import type { StockMovementHistoryEntry } from "@/features/inventory/types";
import { ReceiptButton } from "@/features/receipts/components/receipt-button";
import { cn } from "@/lib/utils";
import { whenLabel } from "../when";

/**
 * Quantas movimentações o resumo mostra.
 *
 * Cinco é o que cabe sem rolagem ao lado dos alertas e o que mantém a resposta pequena — o
 * dashboard precisa carregar em menos de 2s, e o histórico completo tem tela própria.
 */
const RECENT_LIMIT = 5;

const TYPE_ICON: Record<StockMovementHistoryEntry["type"], LucideIcon> = {
  OUT: ArrowUpFromLine,
  IN: ArrowDownToLine,
  ADJUSTMENT: Scale,
};

/**
 * Movimentações recentes (RF-34), em resumo.
 *
 * Mesma query do histórico, só que com `limit` de 5: a chave do cache carrega os parâmetros,
 * então esta lista e a tela de `/inventory` não brigam pelo mesmo espaço — e a movimentação
 * recém-registrada aparece aqui sem recarregar, porque as mutações de estoque já invalidam
 * `stockMovementKeys.lists()`.
 *
 * Não há filtro nem paginação de propósito: no dashboard isso é notícia, não consulta. Quem
 * precisa procurar vai para o histórico, a um clique daqui.
 */
export function RecentMovements() {
  const { data, isPending, error } = useStockMovements({ page: 1, limit: RECENT_LIMIT });
  const entries = data?.data ?? [];

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="border-border flex items-center justify-between gap-3 border-b p-4">
        <h2 className="text-foreground text-base font-semibold">Movimentações recentes</h2>

        <Link
          href="/inventory"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label="Ver o histórico completo de movimentações"
        >
          Ver histórico
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {error ? (
        <div className="p-4">
          <ApiErrorAlert error={error} />
        </div>
      ) : null}

      {isPending ? <MovementSkeleton /> : null}

      {!isPending && !error && entries.length === 0 ? <EmptyState /> : null}

      {entries.length > 0 ? (
        <ul className="divide-border flex-1 divide-y">
          {entries.map((entry) => (
            <MovementItem key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function MovementItem({ entry }: { entry: StockMovementHistoryEntry }) {
  const meta = MOVEMENT_TYPE_META[entry.type];
  const Icon = TYPE_ICON[entry.type];

  return (
    <li className="flex items-start gap-3 p-4">
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          entry.type === "OUT"
            ? "bg-status-warning-bg text-status-warning-icon"
            : entry.type === "IN"
              ? "bg-status-success-bg text-status-success-icon"
              : "bg-status-info-bg text-status-info-icon",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-foreground min-w-0 text-sm font-medium">{entry.item.name}</p>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              entry.type === "OUT" ? "text-status-danger-text" : "text-status-success-text",
            )}
          >
            {signedQuantity(entry.type, entry.quantity)}
          </span>
        </div>

        <p className="text-text-secondary text-xs">
          {/* Motivo primeiro: é o que RF-32 exige registrar e o que explica a linha. */}
          {entry.reason ?? meta.label} · por {entry.user.email} · {whenLabel(entry.createdAt)}
        </p>

        {entry.receipt ? <ReceiptButton receipt={entry.receipt} /> : null}
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="bg-background-subtle text-text-tertiary flex h-12 w-12 items-center justify-center rounded-full">
        <History className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-foreground text-sm font-medium">Nenhuma movimentação ainda</p>
      <p className="text-text-secondary text-sm">
        A primeira entrada ou saída registrada aparece aqui.
      </p>
    </div>
  );
}

function MovementSkeleton() {
  return (
    <div role="status" aria-busy="true" className="divide-border flex-1 divide-y">
      <span className="sr-only">Carregando movimentações recentes...</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-4">
          <div className="bg-background-subtle h-8 w-8 shrink-0 animate-pulse rounded-full motion-reduce:animate-none" />
          <div className="bg-background-subtle h-5 flex-1 animate-pulse rounded motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
