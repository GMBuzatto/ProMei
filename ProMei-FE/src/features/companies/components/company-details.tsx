"use client";

import { ArrowLeft, ChevronRight, Pencil, PlayCircle, StopCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { useCompany } from "../hooks";
import { displayDocument } from "../document";
import { hasDedicatedTheme, SEGMENT_META } from "../segments";
import type { CompanyStatus } from "../types";
import { allowedTransitions, CompanyStatusDialog } from "./company-status-dialog";
import { CompanyStatusBadge } from "./company-status-badge";
import { CompanySubscriptionCard } from "./company-subscription-card";
import { NicheThemePreview } from "./niche-theme-preview";
import { SegmentBadge } from "./segment-badge";

/** Rótulo do botão de cada transição possível a partir do estado atual (RN-11). */
const TRANSITION_ACTION: Record<CompanyStatus, { label: string; destructive: boolean }> = {
  SUSPENDED: { label: "Suspender empresa", destructive: true },
  CANCELED: { label: "Cancelar empresa", destructive: true },
  ACTIVE: { label: "Reativar empresa", destructive: false },
};

export function CompanyDetails({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { data: company, isPending, error } = useCompany(companyId);
  const [pendingTransition, setPendingTransition] = useState<CompanyStatus | null>(null);

  if (isPending) return <DetailsSkeleton />;
  if (error) return <ApiErrorAlert error={error} />;
  if (!company) return null;

  const transitions = allowedTransitions(company.status);

  return (
    <div className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar
      </Button>

      <Breadcrumb companyName={company.name} />

      <header className="flex flex-wrap items-start gap-4">
        <SegmentBadge segment={company.segment} className="mt-1" />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-foreground text-2xl font-bold tracking-tight">{company.name}</h1>
            <CompanyStatusBadge status={company.status} />
          </div>
          <p className="text-text-secondary text-sm">CNPJ: {displayDocument(company.document)}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados da empresa</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-border divide-y">
                <DetailRow label="Razão social" value={company.name} />
                <DetailRow label="CNPJ" value={displayDocument(company.document)} />
                <DetailRow label="Nicho / Segmento" value={SEGMENT_META[company.segment].label} />
                <DetailRow label="Status da empresa">
                  <CompanyStatusBadge status={company.status} />
                </DetailRow>
                <DetailRow label="Criada em" value={formatDateTime(company.createdAt)} />
                <DetailRow label="Atualizada em" value={formatDateTime(company.updatedAt)} />
              </dl>
            </CardContent>
          </Card>

          <CompanySubscriptionCard company={company} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tema do painel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <NicheThemePreview segment={company.segment} />
              {!hasDedicatedTheme(company.segment) ? (
                <p className="text-text-tertiary text-xs leading-relaxed">
                  Paleta própria para este segmento ainda não foi definida pelo time de design.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PermissionGate permissions="companies:update">
                <Link
                  href={`/companies/${company.id}/edit`}
                  className={buttonVariants({ variant: "secondary" }) + " w-full justify-start"}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Editar empresa
                </Link>
              </PermissionGate>

              <PermissionGate permissions="companies:update">
                {transitions.map((target) => {
                  const action = TRANSITION_ACTION[target];
                  const Icon = action.destructive ? StopCircle : PlayCircle;
                  const isCancel = target === "CANCELED";

                  return (
                    <Button
                      key={target}
                      variant="secondary"
                      className={
                        isCancel
                          ? "border-status-danger-border text-status-danger-text hover:bg-status-danger-bg w-full justify-start"
                          : action.destructive
                            ? "border-status-warning-border text-status-warning-text hover:bg-status-warning-bg w-full justify-start"
                            : "w-full justify-start"
                      }
                      onClick={() => setPendingTransition(target)}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {action.label}
                    </Button>
                  );
                })}
              </PermissionGate>

              {transitions.length === 0 ? (
                <p className="text-text-secondary text-sm">
                  Empresa cancelada. Não há transição de estado disponível.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {pendingTransition ? (
        <CompanyStatusDialog
          company={company}
          target={pendingTransition}
          open
          onClose={() => setPendingTransition(null)}
        />
      ) : null}
    </div>
  );
}

function Breadcrumb({ companyName }: { companyName: string }) {
  return (
    <nav aria-label="Trilha de navegação">
      <ol className="text-text-secondary flex flex-wrap items-center gap-2 text-sm">
        <li>
          <Link href="/companies" className="hover:text-foreground transition-colors">
            Empresas
          </Link>
        </li>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        <li className="text-foreground truncate font-medium" aria-current="page">
          {companyName}
        </li>
      </ol>
    </nav>
  );
}

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <dt className="text-text-secondary text-sm">{label}</dt>
      <dd className="text-foreground text-sm font-medium">{children ?? value ?? "-"}</dd>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Carregando empresa...</span>
      <div className="bg-background-subtle h-8 w-2/5 animate-pulse rounded-md" />
      <div className="bg-background-subtle h-4 w-3/5 animate-pulse rounded-md" />
      <div className="border-border bg-surface h-64 animate-pulse rounded-lg border" />
    </div>
  );
}
