"use client";

import { Building2, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
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
import { useCompanies } from "../hooks";
import { displayDocument, normalizeDocument } from "../document";
import { SEGMENT_META } from "../segments";
import { COMPANY_SEGMENTS, COMPANY_STATUSES, type Company } from "../types";
import { CompanyStatsCards } from "./company-stats-cards";
import { CompanyStatusBadge, companyStatusLabel } from "./company-status-badge";
import { SegmentBadge } from "./segment-badge";

/**
 * Listagem de empresas contratantes.
 *
 * Busca e filtros agem **sobre a página carregada**, não sobre a base inteira:
 * `ListCompaniesQueryDto` da API aceita apenas `page` e `limit`. Filtrar no cliente e
 * apresentar como busca global daria o pior resultado possível — "nenhuma empresa
 * encontrada" para uma empresa que existe na página seguinte. Por isso o rótulo diz
 * explicitamente que o filtro é da página atual; quando a API aceitar `search`/`status`,
 * estes controles viram parâmetros da query e o aviso sai.
 */
export function CompaniesList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [segmentFilter, setSegmentFilter] = useState("ALL");

  const { data, isPending, error } = useCompanies({ page, limit: DEFAULT_PAGE_SIZE });

  const companies = useMemo(() => data?.data ?? [], [data]);
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = normalizeDocument(search);

    return companies.filter((company) => {
      if (statusFilter !== "ALL" && company.status !== statusFilter) return false;
      if (segmentFilter !== "ALL" && company.segment !== segmentFilter) return false;
      if (term.length === 0) return true;

      const matchesName = company.name.toLowerCase().includes(term);
      const matchesDocument = digits.length > 0 && company.document.includes(digits);
      return matchesName || matchesDocument;
    });
  }, [companies, search, statusFilter, segmentFilter]);

  const isFiltering = search.trim().length > 0 || statusFilter !== "ALL" || segmentFilter !== "ALL";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Empresas</h1>
          <p className="text-text-secondary text-sm">
            Gerencie as empresas contratantes da plataforma.
          </p>
        </div>

        <PermissionGate permissions="companies:create">
          <Link href="/companies/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova empresa
          </Link>
        </PermissionGate>
      </header>

      <CompanyStatsCards />

      <Card className="overflow-hidden">
        <div className="border-border flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-56 flex-1">
            <Search
              className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou CNPJ nesta página..."
              aria-label="Buscar por nome ou CNPJ nesta página"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Select
            className="w-auto min-w-40"
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">Status: todos</option>
            {COMPANY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {companyStatusLabel(status)}
              </option>
            ))}
          </Select>

          <Select
            className="w-auto min-w-40"
            aria-label="Filtrar por nicho"
            value={segmentFilter}
            onChange={(event) => setSegmentFilter(event.target.value)}
          >
            <option value="ALL">Nicho: todos</option>
            {COMPANY_SEGMENTS.map((segment) => (
              <option key={segment} value={segment}>
                {SEGMENT_META[segment].label}
              </option>
            ))}
          </Select>
        </div>

        {isFiltering ? (
          <p className="text-text-tertiary border-border border-b px-4 py-2 text-xs">
            Busca e filtros aplicam-se apenas às {companies.length} empresas desta página.
          </p>
        ) : null}

        <div className="p-4">
          <ApiErrorAlert error={error} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <thead>
              <tr className="border-border border-b">
                <Th>Empresa</Th>
                <Th>CNPJ</Th>
                <Th>Nicho / Segmento</Th>
                <Th>Status</Th>
                <Th>Criada em</Th>
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

              {visible.map((company) => (
                <CompanyRow key={company.id} company={company} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="text-text-secondary text-sm">
            Página {page} de {lastPage}
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

function CompanyRow({ company }: { company: Company }) {
  return (
    <tr className="border-border hover:bg-surface-hover border-b transition-colors last:border-b-0 motion-reduce:transition-none">
      <Td>
        <span className="text-foreground font-medium">{company.name}</span>
      </Td>
      <Td>
        <span className="text-text-secondary tabular-nums">
          {displayDocument(company.document)}
        </span>
      </Td>
      <Td>
        <SegmentBadge segment={company.segment} />
      </Td>
      <Td>
        <CompanyStatusBadge status={company.status} />
      </Td>
      <Td>
        <span className="text-text-secondary tabular-nums">
          {new Date(company.createdAt).toLocaleDateString("pt-BR")}
        </span>
      </Td>
      <Td className="text-right">
        <Link
          href={`/companies/${company.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Detalhes
        </Link>
      </Td>
    </tr>
  );
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
  return <td className={cn("px-4 py-3 text-sm", className)}>{children}</td>;
}

function SkeletonRows() {
  return <TableSkeletonRows colSpan={6} label="Carregando empresas..." />;
}

function EmptyState({ filtering }: { filtering: boolean }) {
  return (
    <ListEmptyState
      icon={Building2}
      title={filtering ? "Nenhuma empresa nesta página com esses filtros" : "Nenhuma empresa ainda"}
      description={
        filtering
          ? "Limpe os filtros ou navegue para outra página."
          : "Cadastre a primeira empresa contratante da plataforma."
      }
    />
  );
}
