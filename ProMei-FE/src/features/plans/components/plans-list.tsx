"use client";

import { ChevronLeft, ChevronRight, Package, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { ListEmptyState } from "@/components/list-empty-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { periodLabel, periodSuffix } from "../format";
import { usePlans } from "../hooks";
import { PLAN_PERIODS, type Plan } from "../types";
import { PlanStatsCards } from "./plan-stats-cards";

/**
 * Listagem de planos da plataforma (RF-21).
 *
 * Busca e filtro agem **sobre a página carregada**: `ListPlansQueryDto` da API aceita só
 * `page` e `limit`. O rótulo diz isso — filtrar no cliente e chamar de busca global daria
 * "nenhum plano encontrado" para um plano que existe na página seguinte.
 *
 * A coluna "Empresas" do mockup não existe aqui: contar assinantes por plano exigiria uma
 * requisição por empresa (a API não lista assinaturas). Em vez dela, a tela mostra os limites
 * do plano, que são o que a RN-14 usa para bloquear cadastro.
 */
export function PlansList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("ALL");

  const { data, isPending, error } = usePlans({ page, limit: DEFAULT_PAGE_SIZE });

  const plans = useMemo(() => data?.data ?? [], [data]);
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return plans.filter((plan) => {
      if (periodFilter !== "ALL" && plan.period !== periodFilter) return false;
      if (term.length === 0) return true;
      return plan.name.toLowerCase().includes(term);
    });
  }, [plans, search, periodFilter]);

  const isFiltering = search.trim().length > 0 || periodFilter !== "ALL";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Planos</h1>
          <p className="text-text-secondary text-sm">
            Gerencie os planos disponíveis na plataforma.
          </p>
        </div>

        <PermissionGate permissions="plans:create">
          <Link href="/plans/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo plano
          </Link>
        </PermissionGate>
      </header>

      <PlanStatsCards plans={plans} total={total} loading={isPending} />

      <Card className="overflow-hidden">
        <div className="border-border flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-56 flex-1">
            <Search
              className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Buscar por nome nesta página..."
              aria-label="Buscar por nome nesta página"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Select
            className="w-auto min-w-44"
            aria-label="Filtrar por cobrança"
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value)}
          >
            <option value="ALL">Cobrança: todas</option>
            {PLAN_PERIODS.map((period) => (
              <option key={period} value={period}>
                {periodLabel(period)}
              </option>
            ))}
          </Select>
        </div>

        {isFiltering ? (
          <p className="text-text-tertiary border-border border-b px-4 py-2 text-xs">
            Busca e filtro aplicam-se apenas aos {plans.length} planos desta página.
          </p>
        ) : null}

        {error ? (
          <div className="p-4">
            <ApiErrorAlert error={error} />
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-border border-b">
                <Th>Plano</Th>
                <Th>Preço</Th>
                <Th>Cobrança</Th>
                <Th>Limites (RN-14)</Th>
                <Th>Criado em</Th>
                {/* pr-7 = px-4 da célula + px-3 do botão: o rótulo fica na mesma vertical das ações. */}
                <Th className="pr-7 text-right">Ações</Th>
              </tr>
            </thead>

            <tbody>
              {isPending ? <SkeletonRows /> : null}

              {!isPending && visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12">
                    <EmptyState filtering={isFiltering} />
                  </td>
                </tr>
              ) : null}

              {visible.map((plan) => (
                <PlanRow key={plan.id} plan={plan} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="text-text-secondary text-sm">
            Página {page} de {lastPage}
            {total > 0 ? ` · ${total} ${total === 1 ? "plano" : "planos"}` : null}
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

function PlanRow({ plan }: { plan: Plan }) {
  return (
    <tr className="border-border hover:bg-surface-hover border-b transition-colors last:border-b-0 motion-reduce:transition-none">
      <Td>
        <Link
          href={`/plans/${plan.id}`}
          className="text-foreground hover:text-text-brand font-medium transition-colors motion-reduce:transition-none"
        >
          {plan.name}
        </Link>
      </Td>
      <Td>
        <span className="text-foreground tabular-nums">{formatMoney(plan.price)}</span>
        <span className="text-text-tertiary text-xs"> {periodSuffix(plan.period)}</span>
      </Td>
      <Td>
        <span className="text-text-secondary">{periodLabel(plan.period)}</span>
      </Td>
      <Td>
        <span className="text-text-secondary tabular-nums">
          {plan.limits.maxUsers} usuários · {plan.limits.maxItems} itens
        </span>
      </Td>
      <Td>
        <span className="text-text-secondary tabular-nums">
          {new Date(plan.createdAt).toLocaleDateString("pt-BR")}
        </span>
      </Td>
      <Td className="text-right">
        <Link
          href={`/plans/${plan.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label={`Ver detalhes do plano ${plan.name}`}
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
      title={filtering ? "Nenhum plano nesta página com esses filtros" : "Nenhum plano cadastrado"}
      description={
        filtering
          ? "Limpe os filtros ou navegue para outra página."
          : "Cadastre o primeiro plano para poder vinculá-lo a uma empresa."
      }
    />
  );
}

function SkeletonRows() {
  return <TableSkeletonRows colSpan={6} label="Carregando planos..." rows={4} />;
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
