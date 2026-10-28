"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assignRoleToUser, removeRoleFromUser } from "@/features/roles/api";
import { roleKeys } from "@/features/roles/hooks";
import { userKeys } from "./keys";
import {
  createUser,
  deactivateUser,
  getUser,
  listUsers,
  resetUserPassword,
  updateUser,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
} from "./api";

export { userKeys };

/** A API devolve a equipe inteira numa lista só — busca e filtros são do cliente. */
export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: ({ signal }) => listUsers({ signal }),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: ({ signal }) => getUser(id, { signal }),
    enabled: id.length > 0,
  });
}

/**
 * Cria o usuário já com papel — a API aceita `roleId` no corpo, então é uma requisição só.
 *
 * Invalida também os papéis porque `usersCount` mudou.
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.list() });
      void queryClient.invalidateQueries({ queryKey: roleKeys.list() });
    },
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateUserInput) => updateUser(id, input),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.detail(id), user);
      void queryClient.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}

export type SetUserRoleInput = {
  userId: string;
  /** Papel que fica. Vazio remove todos sem colocar nenhum. */
  roleId: string;
  /** Papéis vinculados hoje — a API não tem "trocar papel", só vincular e desvincular. */
  currentRoleIds: string[];
};

/**
 * Troca o papel do usuário.
 *
 * A API não tem operação de troca: são `DELETE /roles/users/:userId/:roleId` seguidos de um
 * `POST /roles/users/:userId`. **Vincular primeiro** é proposital — se o papel novo é Admin e
 * o antigo também era, remover antes esbarraria na RN-04 (`ULTIMO_ADMIN`) ao tirar o único
 * Admin ativo, mesmo que o resultado final mantivesse um.
 *
 * Não é atômico: se a remoção falhar depois do vínculo, o usuário fica com dois papéis — o
 * que soma permissões, nunca as tira. É o lado seguro para errar, e a listagem mostra os dois.
 */
export function useSetUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, roleId, currentRoleIds }: SetUserRoleInput) => {
      if (roleId && !currentRoleIds.includes(roleId)) {
        await assignRoleToUser(userId, roleId);
      }

      for (const current of currentRoleIds) {
        if (current === roleId) continue;
        await removeRoleFromUser(userId, current);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      void queryClient.invalidateQueries({ queryKey: roleKeys.list() });
    },
  });
}

/** Desativa (a API não exclui usuário — ele tem histórico apontando para ele). */
export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}

/**
 * Reset de senha pelo Admin (RF-04).
 *
 * Invalida a lista porque o usuário volta a `mustChangePassword: true`, e a tela mostra isso.
 */
export function useResetUserPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ResetPasswordInput) => resetUserPassword(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}
