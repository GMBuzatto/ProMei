"use client";

import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { ListEmptyState } from "@/components/list-empty-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { useItems } from "@/features/items/hooks";
import { ReceiptButton } from "@/features/receipts/components/receipt-button";
import { API_MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import {
  filterByType,
  HISTORY_PERIODS,
  periodStart,
  signedQuantity,
  type HistoryPeriod,
} from "../history";
import { useStockMovements } from "../hooks";
import { MOVEMENT_TYPE_META } from "../movement";
import {
  STOCK_MOVEMENT_TYPES,
  type StockMovementHistoryEntry,
  type StockMovementType,
} from "../types";

/**
 * Quantos itens entram no seletor de filtro. É o teto de `PAGINATION_MAX_LIMIT` da API — quem
 * tiver catálogo maior filtra entre os primeiros; o aviso abaixo do campo diz isso.
 */
const ITEM_FILTER_LIMIT = API_MAX_PAGE_SIZE;

type TypeFilter = StockMovementType | "ALL";

/**
 * Histórico de movimentações (RF-34).
 *
 * **Item e período são filtros da API** (`?itemId=&dateFrom=`), então valem sobre o histórico
 * inteiro. **Tipo não é**: `ListStockMovementsQueryDto` não aceita esse campo, então ele
 * filtra só a página carregada — e a tela avisa, porque "nenhuma saída" ao lado de uma saída
 * que existe na página seguinte é pior que filtro nenhum.
 *
 * A quantidade aparece assinada: a API manda saída como positiva (a direção mora no tipo), e
 * exibir o número cru mostraria "25" para uma baixa de 25 justamente na linha que mais se
 * audita (RNF-06).
 *
 * A coluna de comprovante mostra o número da saída e baixa o PDF (RF-33). Ela depende de o
 * `findAll` da API selecionar a relação `receipt` — enquanto não selecionar, a célula diz que
 * o dado não veio, em vez de fingir que a saída não tem comprovante. Buscar um a um seria N+1.
 */
export function MovementHistory() {
  const [page, setPage] = useState(1);
  const [itemId, setItemId] = useState("");
  const [period, setPeriod] = useState<HistoryPeriod>("30");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  // Preso ao período escolhido, não ao instante do render: `periodStart` ancora na meia-noite
  // justamente porque este valor entra na chave do cache.
  const dateFrom = useMemo(() => periodStart(period), [period]);

  const params = useMemo(
    () => ({ page, limit: DEFAULT_PAGE_SIZE, itemId: itemId || undefined, dateFrom }),
    [page, itemId, dateFrom],
  );

  const { data, isPending, isFetching, error } = useStockMovements(params);

  const entries = useMemo(() => data?.data ?? [], [data]);
  const visible = useMemo(() => filterByType(entries, typeFilter), [entries, typeFilter]);

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  /** Qualquer mudança de filtro do servidor recomeça da primeira página. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-foreground text-lg font-semibold">Histórico de movimentações</h2>
        <p className="text-text-secondary text-sm">
          Toda entrada, saída e ajuste com autor, data e motivo. O registro é imutável.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="border-border flex flex-wrap items-end gap-3 border-b p-4">
          {/* Montar o seletor exige ler o catálogo, que é outra permissão (`items:read`). Sem
              ela o histórico continua inteiro — só não dá para recortar por item. */}
          <PermissionGate permissions="items:read">
            <ItemFilter value={itemId} onChange={(value) => changeFilter(() => setItemId(value))} />
          </PermissionGate>

          <div className="min-w-44 space-y-1.5">
            <Label htmlFor="history-period">Período</Label>
            <Select
              id="history-period"
              value={period}
              onChange={(event) =>
                changeFilter(() => setPeriod(event.target.value as HistoryPeriod))
              }
            >
              {HISTORY_PERIODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-40 space-y-1.5">
            <Label htmlFor="history-type">Tipo</Label>
            <Select
              id="history-type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
            >
              <option value="ALL">Todos</option>
              {STOCK_MOVEMENT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {MOVEMENT_TYPE_META[option].label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {typeFilter !== "ALL" ? (
          <p className="text-text-tertiary border-border border-b px-4 py-2 text-xs">
            O filtro por tipo aplica-se apenas às {entries.length} movimentações desta página. Item
            e período valem para todo o histórico.
          </p>
        ) : null}

        {error ? (
          <div className="p-4">
            <ApiErrorAlert error={error} />
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-left">
            <thead>
              <tr className="border-border border-b">
                <Th>Quando</Th>
                <Th>Item</Th>
                <Th>Tipo</Th>
                <Th className="text-right">Quantidade</Th>
                <Th>Motivo</Th>
                <Th>Autor</Th>
                <Th>Comprovante</Th>
              </tr>
            </thead>

            <tbody aria-busy={isFetching}>
              {isPending ? <SkeletonRows /> : null}

              {!isPending && visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <EmptyState filteringType={typeFilter !== "ALL" && entries.length > 0} />
                  </td>
                </tr>
              ) : null}

              {visible.map((entry) => (
                <MovementRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="text-text-secondary text-sm">
            Página {page} de {lastPage}
            {total > 0 ? ` · ${total} ${total === 1 ? "movimentação" : "movimentações"}` : null}
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
    </section>
  );
}

/**
 * Recorte por item — filtro **da API**, então vale sobre o histórico inteiro.
 *
 * Fica em componente próprio porque só quem tem `items:read` monta a lista: com o hook no
 * componente de cima, a requisição sairia mesmo para quem receberia 403.
 */
function ItemFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { data } = useItems({ page: 1, limit: ITEM_FILTER_LIMIT });

  const items = data?.data ?? [];
  const hasHiddenItems = (data?.total ?? 0) > items.length;

  return (
    <div className="min-w-56 flex-1 space-y-1.5">
      <Label htmlFor="history-item">Item</Label>
      <Select id="history-item" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos os itens</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.sku}
          </option>
        ))}
      </Select>
      {hasHiddenItems ? (
        <p className="text-text-tertiary text-xs">
          A lista traz os {items.length} primeiros itens do catálogo.
        </p>
      ) : null}
    </div>
  );
}

function MovementRow({ entry }: { entry: StockMovementHistoryEntry }) {
  const meta = MOVEMENT_TYPE_META[entry.type];
  const when = new Date(entry.createdAt);

  return (
    <tr className="border-border hover:bg-surface-hover border-b transition-colors last:border-b-0 motion-reduce:transition-none">
      <Td>
        <time dateTime={entry.createdAt} className="text-foreground">
          {when.toLocaleDateString("pt-BR")}
        </time>
        <span className="text-text-tertiary block text-xs">
          {when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </Td>
      <Td>
        <span className="text-foreground font-medium">{entry.item.name}</span>
        <span className="text-text-tertiary block font-mono text-xs">{entry.item.sku}</span>
      </Td>
      <Td>
        <Badge variant={meta.tone}>{meta.label}</Badge>
      </Td>
      <Td className="text-right">
        <span
          className={cn(
            "font-medium tabular-nums",
            entry.type === "OUT" ? "text-status-danger-text" : "text-status-success-text",
          )}
        >
          {signedQuantity(entry.type, entry.quantity)}
        </span>
      </Td>
      <Td>
        <span className="text-text-secondary">{entry.reason ?? "-"}</span>
      </Td>
      <Td>
        <span className="text-text-secondary">{entry.user.email}</span>
      </Td>
      <Td>
        <ReceiptCell entry={entry} />
      </Td>
    </tr>
  );
}

/**
 * Comprovante da linha (RF-33).
 *
 * Três desfechos diferentes que não podem virar o mesmo traço mudo:
 * entrada e ajuste **não geram** comprovante; saída gera e o número vira download do PDF;
 * saída sem comprovante no payload é o caso em aberto — o `findAll` da API ainda não
 * seleciona a relação, então a tela diz que o dado não veio em vez de afirmar que não existe.
 */
function ReceiptCell({ entry }: { entry: StockMovementHistoryEntry }) {
  if (entry.type !== "OUT") {
    return <span className="text-text-tertiary">-</span>;
  }

  if (!entry.receipt) {
    return (
      <span
        className="text-text-tertiary"
        title="A saída tem comprovante; o número não veio nesta resposta da API."
      >
        -
      </span>
    );
  }

  return <ReceiptButton receipt={entry.receipt} />;
}

function EmptyState({ filteringType }: { filteringType: boolean }) {
  return (
    <ListEmptyState
      icon={History}
      title={
        filteringType
          ? "Nenhuma movimentação desse tipo nesta página"
          : "Nenhuma movimentação no período"
      }
      description={
        filteringType
          ? "Veja as outras páginas ou escolha “Todos” para ver o período inteiro."
          : "Ajuste o período ou o item do filtro, ou registre a movimentação acima."
      }
    />
  );
}

function SkeletonRows() {
  return <TableSkeletonRows colSpan={7} label="Carregando movimentações..." />;
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
