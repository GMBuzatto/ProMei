"use client";

import { AlertTriangle, ArrowRight, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useItems } from "@/features/items/hooks";
import {
  isStockAlert,
  sortByStockUrgency,
  stockAlertLabel,
  stockLevel,
} from "@/features/items/stock";
import type { Item } from "@/features/items/types";
import { API_MAX_PAGE_SIZE } from "@/lib/pagination";

/**
 * Quantos itens o dashboard varre atrás de alerta.
 *
 * A API não filtra por estoque mínimo (`ListItemsQueryDto` aceita busca, categoria e
 * situação), então o alerta é apurado aqui, sobre a maior página que a API entrega. Para
 * o catálogo de um MEI isso é o catálogo inteiro; acima disso, o rodapé do card avisa.
 */
const SCAN_LIMIT = API_MAX_PAGE_SIZE;

/** Quantos alertas aparecem no resumo. O resto vira "e mais N", com link para o catálogo. */
const VISIBLE_LIMIT = 5;

/**
 * Alertas de estoque mínimo (RF-35).
 *
 * Só itens **ativos** entram: item inativo não é reposto, e ele empurraria para fora da lista
 * um alerta que alguém precisa ver hoje.
 *
 * O item em alerta já vem com o caminho da solução: cada linha leva à entrada de estoque com
 * o tipo escolhido (`?type=IN`), que é o que resolve a falta.
 */
export function StockAlerts() {
  const { data, isPending, error } = useItems({ page: 1, limit: SCAN_LIMIT, status: "ACTIVE" });

  const items = useMemo(() => data?.data ?? [], [data]);
  const alerts = useMemo(() => sortByStockUrgency(items.filter(isStockAlert)), [items]);

  const visible = alerts.slice(0, VISIBLE_LIMIT);
  const hidden = alerts.length - visible.length;
  const scanIncomplete = (data?.total ?? 0) > items.length;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="border-border flex items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-foreground text-base font-semibold">Alertas de estoque</h2>
          {alerts.length > 0 ? <Badge variant="warning">{alerts.length}</Badge> : null}
        </div>

        <Link
          href="/items"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label="Ver o catálogo de itens"
        >
          Ver itens
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {error ? (
        <div className="p-4">
          <ApiErrorAlert error={error} />
        </div>
      ) : null}

      {isPending ? <AlertsSkeleton /> : null}

      {!isPending && !error && alerts.length === 0 ? <EmptyState /> : null}

      {visible.length > 0 ? (
        <ul className="divide-border flex-1 divide-y">
          {visible.map((item) => (
            <AlertItem key={item.id} item={item} />
          ))}
        </ul>
      ) : null}

      {hidden > 0 || (scanIncomplete && alerts.length > 0) ? (
        <div className="border-border text-text-tertiary border-t px-4 py-2 text-xs">
          {hidden > 0 ? (
            <>
              e mais {hidden} {hidden === 1 ? "item" : "itens"} em alerta.{" "}
            </>
          ) : null}
          {scanIncomplete
            ? `A conferência olha os ${items.length} primeiros itens do catálogo.`
            : null}
        </div>
      ) : null}
    </Card>
  );
}

function AlertItem({ item }: { item: Item }) {
  const level = stockLevel(item);

  return (
    <li className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <Link
          href={`/items/${item.id}`}
          className="text-foreground hover:text-text-brand text-sm font-medium transition-colors motion-reduce:transition-none"
        >
          {item.name}
        </Link>
        <p className="text-text-tertiary font-mono text-xs">{item.sku}</p>

        {/* Cor sozinha não chega a quem não a distingue: o motivo vem escrito. */}
        <Badge variant={level === "empty" ? "danger" : "warning"}>{stockAlertLabel(item)}</Badge>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-foreground text-sm font-semibold tabular-nums">
          {item.stock.toLocaleString("pt-BR")} {item.unit}
        </span>
        <Link
          href="/inventory?type=IN"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label={`Registrar entrada de estoque para ${item.name}`}
        >
          Repor
        </Link>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="bg-status-success-bg text-status-success-icon flex h-12 w-12 items-center justify-center rounded-full">
        <PackageCheck className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-foreground text-sm font-medium">Nenhum item em alerta</p>
      <p className="text-text-secondary text-sm">
        Todos os itens ativos estão acima do estoque mínimo.
      </p>
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="divide-border flex-1 divide-y">
      <span className="sr-only">Conferindo o estoque mínimo...</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-4">
          <AlertTriangle className="text-background-subtle h-8 w-8 shrink-0" aria-hidden="true" />
          <div className="bg-background-subtle h-5 flex-1 animate-pulse rounded motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
