"use client";

import { ArrowLeft, ChevronRight, Pencil, PlayCircle, StopCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { formatMoney } from "@/lib/money";
import { useItem, useUpdateItemStatus } from "../hooks";
import { stockAlertLabel } from "../stock";
import { ItemDeleteDialog } from "./item-delete-dialog";
import { ItemStatusBadge } from "./item-status-badge";
import { StockCell } from "./stock-cell";

/** Detalhe do item: dados cadastrais, saldo com alerta e o ciclo de vida (docs/04). */
export function ItemDetails({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { data: item, isPending, error } = useItem(itemId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = useUpdateItemStatus(itemId);

  if (isPending) return <DetailsSkeleton />;
  if (error) return <ApiErrorAlert error={error} />;
  if (!item) return null;

  const isActive = item.status === "ACTIVE";
  const alert = stockAlertLabel(item);

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
            <Link href="/items" className="hover:text-foreground transition-colors">
              Itens
            </Link>
          </li>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          <li className="text-foreground truncate font-medium" aria-current="page">
            {item.name}
          </li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-foreground text-2xl font-bold tracking-tight">{item.name}</h1>
            <ItemStatusBadge status={item.status} />
          </div>
          <p className="text-text-secondary font-mono text-sm">SKU {item.sku}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <PermissionGate permissions="items:update">
            <Link
              href={`/items/${item.id}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar
            </Link>
          </PermissionGate>

          <PermissionGate permissions="items:update">
            <Button
              variant="secondary"
              loading={status.isPending}
              loadingText={isActive ? "Inativando..." : "Reativando..."}
              className={
                isActive
                  ? "border-status-warning-border text-status-warning-text hover:bg-status-warning-bg"
                  : undefined
              }
              onClick={() => status.mutate(isActive ? "INACTIVE" : "ACTIVE")}
            >
              {isActive ? (
                <>
                  <StopCircle className="h-4 w-4" aria-hidden="true" />
                  Inativar
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  Reativar
                </>
              )}
            </Button>
          </PermissionGate>

          <PermissionGate permissions="items:delete">
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

      <ApiErrorAlert error={status.error} />

      {!isActive ? (
        <p className="border-border bg-surface-subtle text-text-secondary rounded-md border p-4 text-sm">
          Item inativo: não aceita novas entradas nem saídas de estoque. Reative para voltar a
          movimentá-lo.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Dados do item</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-border divide-y">
              <DetailRow label="Nome" value={item.name} />
              <DetailRow label="SKU" value={item.sku} />
              <DetailRow label="Categoria" value={item.category ?? undefined} />
              <DetailRow label="Unidade" value={item.unit} />
              <DetailRow label="Preço" value={formatMoney(item.price)} />
              <DetailRow label="Descrição" value={item.description ?? undefined} />
              <DetailRow label="Criado em" value={formatDateTime(item.createdAt)} />
              <DetailRow label="Atualizado em" value={formatDateTime(item.updatedAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estoque</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StockCell item={item} />

            <p className="text-text-tertiary text-xs leading-relaxed">
              {alert
                ? "O saldo só muda por movimentação de entrada ou saída. Registre uma entrada para repor."
                : "O saldo só muda por movimentação de entrada ou saída, nunca pela edição do item."}
            </p>
          </CardContent>
        </Card>
      </div>

      {confirmingDelete ? (
        <ItemDeleteDialog
          item={item}
          open
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => router.replace("/items")}
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
      <span className="sr-only">Carregando item...</span>
      <div className="bg-background-subtle h-8 w-2/5 animate-pulse rounded-md" />
      <div className="bg-background-subtle h-4 w-3/5 animate-pulse rounded-md" />
      <div className="border-border bg-surface h-64 animate-pulse rounded-lg border" />
    </div>
  );
}
