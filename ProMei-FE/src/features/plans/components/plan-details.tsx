"use client";

import { ArrowLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { formatMoney } from "@/lib/money";
import { periodLabel, periodSuffix } from "../format";
import { usePlan } from "../hooks";
import { PlanDeleteDialog } from "./plan-delete-dialog";
import { PlanSubscribersCard } from "./plan-subscribers-card";

/** Detalhe do plano: o que ele é, e quem o assina. */
export function PlanDetails({ planId }: { planId: string }) {
  const router = useRouter();
  const { data: plan, isPending, error } = usePlan(planId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isPending) return <DetailsSkeleton />;
  if (error) return <ApiErrorAlert error={error} />;
  if (!plan) return null;

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

      <nav aria-label="Trilha de navegação">
        <ol className="text-text-secondary flex flex-wrap items-center gap-2 text-sm">
          <li>
            <Link href="/plans" className="hover:text-foreground transition-colors">
              Planos
            </Link>
          </li>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          <li className="text-foreground truncate font-medium" aria-current="page">
            {plan.name}
          </li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-foreground text-2xl font-bold tracking-tight">{plan.name}</h1>
          <p className="text-text-secondary text-sm">
            {formatMoney(plan.price)} {periodSuffix(plan.period)} · cobrança{" "}
            {periodLabel(plan.period).toLowerCase()}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <PermissionGate permissions="plans:update">
            <Link
              href={`/plans/${plan.id}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar plano
            </Link>
          </PermissionGate>

          <PermissionGate permissions="plans:delete">
            <Button
              variant="secondary"
              className="border-status-danger-border text-status-danger-text hover:bg-status-danger-bg"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Excluir
            </Button>
          </PermissionGate>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Dados do plano</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-border divide-y">
              <DetailRow label="Nome" value={plan.name} />
              <DetailRow label="Preço" value={formatMoney(plan.price)} />
              <DetailRow label="Cobrança" value={periodLabel(plan.period)} />
              <DetailRow label="Máximo de usuários" value={String(plan.limits.maxUsers)} />
              <DetailRow label="Máximo de itens" value={String(plan.limits.maxItems)} />
              <DetailRow label="Criado em" value={formatDateTime(plan.createdAt)} />
              <DetailRow label="Atualizado em" value={formatDateTime(plan.updatedAt)} />
            </dl>
          </CardContent>
        </Card>

        <PlanSubscribersCard plan={plan} />
      </div>

      {confirmingDelete ? (
        <PlanDeleteDialog
          plan={plan}
          open
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => router.replace("/plans")}
        />
      ) : null}
    </div>
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
      <span className="sr-only">Carregando plano...</span>
      <div className="bg-background-subtle h-8 w-2/5 animate-pulse rounded-md" />
      <div className="bg-background-subtle h-4 w-3/5 animate-pulse rounded-md" />
      <div className="border-border bg-surface h-64 animate-pulse rounded-lg border" />
    </div>
  );
}
