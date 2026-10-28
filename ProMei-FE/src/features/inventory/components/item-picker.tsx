"use client";

import { Package, Search } from "lucide-react";
import { useState } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useItems } from "@/features/items/hooks";
import { stockAlertLabel } from "@/features/items/stock";
import type { Item } from "@/features/items/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

const RESULTS_LIMIT = 8;
const SEARCH_DELAY_MS = 300;

/**
 * Escolha dos itens da movimentação — marcar é o segundo clique do fluxo (RNF-11).
 *
 * A lista já vem carregada, sem busca digitada: obrigar a digitar antes de ver qualquer item
 * transformaria o clique em "digite, espere, clique". Só itens **ativos** aparecem, porque a
 * API recusa movimentação de item inativo (`ITEM_INATIVO`) — oferecer um seria oferecer um
 * erro.
 *
 * Itens já marcados continuam na lista, marcados: sumir da lista ao marcar faria a próxima
 * escolha pular de posição embaixo do cursor.
 */
export function ItemPicker({
  selectedIds,
  onToggle,
  disabled = false,
}: {
  selectedIds: Set<string>;
  onToggle: (item: Item, selected: boolean) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DELAY_MS);

  const { data, isPending, error } = useItems({
    page: 1,
    limit: RESULTS_LIMIT,
    search: debouncedSearch,
    status: "ACTIVE",
  });

  const items = data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="movement-item-search">Itens</Label>
        <div className="relative">
          <Search
            className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id="movement-item-search"
            className="pl-9"
            placeholder="Buscar por nome ou SKU..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <ApiErrorAlert error={error} />

      <ul className="space-y-2" aria-busy={isPending}>
        {isPending
          ? Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="bg-background-subtle h-14 animate-pulse rounded-lg" />
            ))
          : null}

        {!isPending && items.length === 0 ? (
          <li className="border-border text-text-secondary flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm">
            <Package className="text-text-tertiary h-6 w-6" aria-hidden="true" />
            {search.trim().length > 0
              ? "Nenhum item ativo encontrado para esta busca."
              : "Nenhum item ativo no catálogo."}
          </li>
        ) : null}

        {items.map((item) => {
          const alert = stockAlertLabel(item);
          const isSelected = selectedIds.has(item.id);

          return (
            <li key={item.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                  "hover:bg-surface-hover motion-reduce:transition-none",
                  isSelected ? "border-border-brand bg-surface-selected" : "border-border",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={disabled}
                  onChange={(event) => onToggle(item, event.target.checked)}
                  aria-label={`Selecionar ${item.name}`}
                />

                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="text-text-tertiary block font-mono text-xs">SKU {item.sku}</span>
                </span>

                <span className="shrink-0 text-right">
                  <span
                    className={cn(
                      "block text-sm tabular-nums",
                      alert ? "text-status-warning-text font-semibold" : "text-text-secondary",
                    )}
                  >
                    {item.stock} {item.unit}
                  </span>
                  {alert ? (
                    <span className="text-status-warning-text block text-xs">{alert}</span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
