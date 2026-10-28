"use client";

import { ApiErrorAlert } from "@/components/api-error-alert";
import { useUsers } from "../hooks";
import { UserForm } from "./user-form";

/**
 * Carrega a equipe antes de montar o formulário de edição.
 *
 * Busca a **lista**, e não `GET /users/:id`, por dois motivos: é a mesma query que a listagem
 * já deixou no cache (então vir da listagem não custa requisição nova), e a RN-04 depende de
 * saber quantos Admins ativos existem — com o usuário sozinho não dá para dizer se ele é o
 * último.
 */
export function EditUserScreen({ userId }: { userId: string }) {
  const { data: users = [], isPending, error } = useUsers();
  const user = users.find((entry) => entry.id === userId);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">Carregando usuário...</span>
        <div className="border-border bg-surface h-96 animate-pulse rounded-lg border" />
      </div>
    );
  }

  if (error) return <ApiErrorAlert error={error} />;

  if (!user) {
    return (
      <div
        role="alert"
        className="border-border bg-surface text-text-secondary rounded-lg border p-6 text-sm"
      >
        Este usuário não existe mais nesta empresa.
      </div>
    );
  }

  return <UserForm user={user} users={users} />;
}
