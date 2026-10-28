"use client";

import { Eye, Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { usePermissions } from "@/features/auth/use-permissions";
import { cn } from "@/lib/utils";
import { useRoles } from "../hooks";
import { actionLabel, resourceLabel } from "../matrix";
import type { Role } from "../types";
import { RoleDeleteDialog } from "./role-delete-dialog";

/**
 * Papéis da empresa (RF-12).
 *
 * A API devolve a lista inteira, já ordenada com os papéis de sistema na frente — que é a
 * ordem certa para ler: eles são a referência do que existe antes de alguém inventar o
 * próprio.
 *
 * **Papel de sistema não é editável nem excluível** (aceite): Admin e Colaborador nascem com a
 * empresa e a API recusa as duas operações. Na tela, "Editar" vira "Ver permissões" e a
 * exclusão fica desabilitada com o motivo no `title` — em vez de sumir e deixar a pessoa
 * procurando o botão.
 */
export function RolesList() {
  const { data: roles = [], isPending, error } = useRoles();
  const canUpdate = usePermissions("roles:update");
  const canDelete = usePermissions("roles:delete");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Papéis e permissões</h1>
          <p className="text-text-secondary text-sm">
            Cada papel é um conjunto de permissões por recurso e ação.
          </p>
        </div>

        <PermissionGate permissions="roles:create">
          <Link href="/roles/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo papel
          </Link>
        </PermissionGate>
      </header>

      {error ? <ApiErrorAlert error={error} /> : null}

      {isPending ? <ListSkeleton /> : null}

      {!isPending && roles.length === 0 && !error ? <EmptyState /> : null}

      <div className="grid gap-4">
        {roles.map((role) => (
          <RoleCard key={role.id} role={role} canUpdate={canUpdate} canDelete={canDelete} />
        ))}
      </div>
    </div>
  );
}

function RoleCard({
  role,
  canUpdate,
  canDelete,
}: {
  role: Role;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const users = role.usersCount ?? 0;

  return (
    <Card className="p-5">
      {/* Sem `flex-wrap` a partir de sm: as ações ficam ancoradas à direita e é o bloco da
          esquerda que encolhe — daí o `min-w-0`, que é o que deixa os selos de permissão
          quebrarem linha em vez de esticar o card e empurrar os botões para baixo. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-foreground text-base font-semibold">{role.name}</h2>

            {role.isSystem ? (
              <Badge variant="info">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Sistema
              </Badge>
            ) : (
              <Badge variant="neutral">Personalizado</Badge>
            )}
          </div>

          <p className="text-text-secondary text-sm">
            {role.permissions.length === 0
              ? "Nenhuma permissão"
              : `${role.permissions.length} permissões`}
            {" · "}
            {users === 1 ? "1 usuário" : `${users} usuários`}
          </p>

          <PermissionSummary permissions={role.permissions} />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {canUpdate || role.isSystem ? (
            <Link
              href={`/roles/${role.id}/edit`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
              aria-label={
                role.isSystem
                  ? `Ver as permissões do papel ${role.name}`
                  : `Editar o papel ${role.name}`
              }
            >
              {role.isSystem ? (
                <>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Ver permissões
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Editar
                </>
              )}
            </Link>
          ) : null}

          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={role.isSystem}
              onClick={() => setDeleting(true)}
              aria-label={`Excluir o papel ${role.name}`}
              title={
                role.isSystem
                  ? "Papel de sistema não pode ser excluído"
                  : `Excluir o papel ${role.name}`
              }
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      {deleting ? <RoleDeleteDialog role={role} open onClose={() => setDeleting(false)} /> : null}
    </Card>
  );
}

/** Quantas ações o papel concede por recurso — o resumo da matriz sem abrir a matriz. */
function PermissionSummary({ permissions }: { permissions: string[] }) {
  if (permissions.length === 0) return null;

  const byResource = new Map<string, string[]>();

  for (const permission of permissions) {
    const [resource, action] = permission.split(":");
    if (!resource || !action) continue;

    byResource.set(resource, [...(byResource.get(resource) ?? []), action]);
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {[...byResource.entries()]
        .sort((a, b) => resourceLabel(a[0]).localeCompare(resourceLabel(b[0]), "pt-BR"))
        .map(([resource, actions]) => (
          <li
            key={resource}
            // `break-words` porque um recurso com as quatro ações não cabe numa linha estreita
            // e precisa quebrar dentro do próprio selo, não vazar o card.
            className="border-border bg-surface-subtle text-text-secondary max-w-full rounded-md border px-2 py-1 text-xs break-words"
          >
            <span className="text-foreground font-medium">{resourceLabel(resource)}</span>{" "}
            {actions.map(actionLabel).join(", ").toLowerCase()}
          </li>
        ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <Card className="p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="bg-background-subtle text-text-tertiary flex h-12 w-12 items-center justify-center rounded-full">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-foreground text-sm font-medium">Nenhum papel cadastrado</p>
        <p className="text-text-secondary text-sm">
          Crie um papel para definir o que cada pessoa da equipe pode fazer.
        </p>
      </div>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4">
      <span className="sr-only">Carregando papéis...</span>
      {Array.from({ length: 3 }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-border bg-surface h-28 animate-pulse rounded-lg border motion-reduce:animate-none",
        className,
      )}
    />
  );
}
