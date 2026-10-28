"use client";

import { ApiErrorAlert } from "@/components/api-error-alert";
import { useRole } from "../hooks";
import { RoleForm } from "./role-form";

/**
 * Carrega o papel antes de montar o formulário — sem as permissões atuais a matriz nasceria
 * vazia, e salvar assim revogaria tudo (o `PATCH` substitui o conjunto inteiro).
 */
export function EditRoleScreen({ roleId }: { roleId: string }) {
  const { data: role, isPending, error } = useRole(roleId);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">Carregando papel...</span>
        <div className="border-border bg-surface h-96 animate-pulse rounded-lg border motion-reduce:animate-none" />
      </div>
    );
  }

  if (error) return <ApiErrorAlert error={error} />;
  if (!role) return null;

  return <RoleForm role={role} />;
}
