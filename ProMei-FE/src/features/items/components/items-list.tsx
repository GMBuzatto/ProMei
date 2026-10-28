"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Package, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { ListEmptyState } from "@/components/list-empty-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatMoney } from "@/lib/money";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { useItems } from "../hooks";
import { countStockAlerts, isStockAlert } from "../stock";
import { ITEM_STATUSES, type Item } from "../types";
import { ItemStatusBadge, itemStatusLabel } from "./item-status-badge";
import { StockCell } from "./stock-cell";

/** Tempo parado antes de a busca ir para a API — evita uma requisição por tecla. */
const SEARCH_DELAY_MS = 400;

/**
 * Listagem de itens (RF-30/31).
 *
 * Busca, filtro e paginação são **da API** (`?search=&category=&status=&page=`), não do
 * cliente: diferente de empresas e planos, aqui o filtro vale sobre o catálogo inteiro, e a
 * tela não precisa avisar que enxerga só a página.
 *
 * O filtro de categoria é campo de texto porque a API compara por igualdade exata e não expõe
 * rota de categorias — o `datalist` sugere as que aparecem na página atual, sem impedir
 * digitar outra.
 */
export function ItemsList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("ALL");

  const debouncedSearch = useDebouncedValue(search, SEARCH_DELAY_MS);
  const debouncedCategory = useDebouncedValue(category, SEARCH_DELAY_MS);

  const params = useMemo(
    () => ({
      page,
      limit: DEFAULT_PAGE_SIZE,
      search: debouncedSearch,
      category: debouncedCategory,
      status: status === "ALL" ? undefined : (status as Item["status"]),
    }),
    [page, debouncedSearch, debouncedCategory, status],
  );

  const { data, isPending, isFetching, error } = useItems(params);

  const items = useMemo(() => data?.data ?? [], [data]);
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  const alerts = countStockAlerts(items);

  // Categorias vistas nesta página, como sugestão para o campo de filtro.
  const categorySuggestions = useMemo(
    () => [...new Set(items.map((item) => item.category).filter((value) => value !== null))],
    [items],
  );

  /** Qualquer mudança de filtro recomeça da primeira página. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Itens</h1>
          <p className="text-text-secondary text-sm">
            Catálogo da sua empresa: preço, unidade e saldo em estoque.
          </p>
        </div>

        <PermissionGate permissions="items:create">
          <Link href="/items/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo item
          </Link>
        </PermissionGate>
      </header>

      {alerts > 0 ? <StockAlertBanner count={alerts} /> : null}

      <Card className="overflow-hidden">
        <div className="border-border flex flex-wrap items-end gap-3 border-b p-4">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="item-search">Buscar</Label>
            <div className="relative">
              <Search
                className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id="item-search"
                className="pl-9"
                placeholder="Nome, SKU ou descrição..."
                value={search}
                onChange={(event) => changeFilter(() => setSearch(event.target.value))}
              />
            </div>
          </div>

          <div className="min-w-44 space-y-1.5">
            <Label htmlFor="item-category">Categoria</Label>
            <Input
              id="item-category"
              list="item-categories"
              placeholder="Todas"
              value={category}
              onChange={(event) => changeFilter(() => setCategory(event.target.value))}
            />
            <datalist id="item-categories">
              {categorySuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>

          <div className="min-w-40 space-y-1.5">
            <Label htmlFor="item-status">Situação</Label>
            <Select
              id="item-status"
              value={status}
              onChange={(event) => changeFilter(() => setStatus(event.target.value))}
            >
              <option value="ALL">Todas</option>
              {ITEM_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {itemStatusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ApiErrorAlert error={error} />
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead>
              <tr className="border-border border-b">
                <Th>Item</Th>
                <Th>Categoria</Th>
                <Th>Preço</Th>
                <Th>Estoque</Th>
                <Th>Situação</Th>
                {/* pr-7 = px-4 da célula + px-3 do botão: alinha o rótulo com as ações. */}
                <Th className="pr-7 text-right">Ações</Th>
              </tr>
            </thead>

            <tbody aria-busy={isFetching}>
              {isPending ? <SkeletonRows /> : null}

              {!isPending && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12">
                    <EmptyState filtering={hasFilters(params)} />
                  </td>
                </tr>
              ) : null}

              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="text-text-secondary text-sm">
            Página {page} de {lastPage}
            {total > 0 ? ` · ${total} ${total === 1 ? "item" : "itens"}` : null}
          </p>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= lastPage || isPending}
              onClick={() => setPage((current) => current + 1)}
            >
              Próxima
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function hasFilters(params: { search?: string; category?: string; status?: string }): boolean {
  return Boolean(params.search?.trim() || params.category?.trim() || params.status);
}

/**
 * Aviso no topo da página.
 *
 * Fala só do que está à vista ("nesta página") de propósito: a API não expõe contagem de
 * itens em alerta no catálogo inteiro, e um número que parecesse global seria pior que
 * nenhum — é ele que decide o que comprar.
 */
function StockAlertBanner({ count }: { count: number }) {
  return (
    <div
      role="status"
      className="bg-status-warning-bg border-status-warning-border flex gap-3 rounded-md border p-4"
    >
      <AlertTriangle
        className="text-status-warning-icon mt-0.5 h-5 w-5 shrink-0"
        aria-hidden="true"
      />
      <p className="text-status-warning-text text-sm">
        {count === 1
          ? "1 item nesta página está sem estoque ou abaixo do mínimo."
          : `${count} itens nesta página estão sem estoque ou abaixo do mínimo.`}
      </p>
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  return (
    <tr
      className={cn(
        "border-border hover:bg-surface-hover border-b transition-colors last:border-b-0 motion-reduce:transition-none",
        // Faixa lateral: o alerta precisa ser achável correndo o olho pela tabela, não só
        // ao ler a coluna de estoque.
        isStockAlert(item) && "border-l-status-warning-border border-l-2",
      )}
    >
      <Td>
        <Link
          href={`/items/${item.id}`}
          className="text-foreground hover:text-text-brand font-medium transition-colors motion-reduce:transition-none"
        >
          {item.name}
        </Link>
        <span className="text-text-tertiary block font-mono text-xs">{item.sku}</span>
      </Td>
      <Td>
        <span className="text-text-secondary">{item.category ?? "-"}</span>
      </Td>
      <Td>
        <span className="text-foreground tabular-nums">{formatMoney(item.price)}</span>
        <span className="text-text-tertiary block text-xs">por {item.unit}</span>
      </Td>
      <Td>
        <StockCell item={item} />
      </Td>
      <Td>
        <ItemStatusBadge status={item.status} />
      </Td>
      <Td className="text-right">
        <Link
          href={`/items/${item.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label={`Ver detalhes do item ${item.name}`}
        >
          Detalhes
        </Link>
      </Td>
    </tr>
  );
}

function EmptyState({ filtering }: { filtering: boolean }) {
  return (
    <ListEmptyState
      icon={Package}
      title={filtering ? "Nenhum item encontrado" : "Nenhum item cadastrado"}
      description={
        filtering
          ? "Ajuste a busca ou os filtros para encontrar o que procura."
          : "Cadastre o primeiro item do seu catálogo."
      }
    />
  );
}

function SkeletonRows() {
  return <TableSkeletonRows colSpan={6} label="Carregando itens..." />;
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
  return <td className={cn("px-4 py-4 text-sm", className)}>{children}</td>;
}
