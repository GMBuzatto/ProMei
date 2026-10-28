"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userKeys } from "@/features/users/keys";
import {
  createRole,
  deleteRole,
  getRole,
  listPermissionCatalog,
  listRoles,
  updateRole,
  type RoleInput,
} from "./api";

export const roleKeys = {
  all: ["roles"] as const,
  list: () => [...roleKeys.all, "list"] as const,
  detail: (id: string) => [...roleKeys.all, "detail", id] as const,
  catalog: () => ["permissions", "catalog"] as const,
};

/**
 * Papéis da empresa.
 *
 * `enabled` porque as telas que precisam disto (formulário de usuário) só montam para quem
 * tem `roles:read` — sem a permissão a lista não é buscada, e o campo de papel some em vez
 * de aparecer vazio.
 */
export function useRoles(enabled = true) {
  return useQuery({
    queryKey: roleKeys.list(),
    queryFn: ({ signal }) => listRoles({ signal }),
    enabled,
  });
}

export function useRole(id: string) {
  return useQuery({
    queryKey: roleKeys.detail(id),
    queryFn: ({ signal }) => getRole(id, { signal }),
    enabled: id.length > 0,
  });
}

/**
 * Catálogo de permissões — as linhas e colunas da matriz.
 *
 * É global e praticamente imutável (muda com deploy da API, não com uso), então fica em cache
 * pela sessão inteira: reabrir o formulário não repete a requisição.
 */
export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: roleKeys.catalog(),
    queryFn: ({ signal }) => listPermissionCatalog({ signal }),
    enabled,
    staleTime: Infinity,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RoleInput) => createRole(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.list() });
    },
  });
}

/**
 * Atualiza nome e/ou permissões.
 *
 * Invalida também os usuários: a permissão efetiva de quem tem este papel acabou de mudar, e
 * é ela que decide o que cada tela desenha.
 */
export function useUpdateRole(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<RoleInput>) => updateRole(id, input),
    onSuccess: (role) => {
      queryClient.setQueryData(roleKeys.detail(id), role);
      void queryClient.invalidateQueries({ queryKey: roleKeys.list() });
      void queryClient.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}

/** Exclui o papel. Os vínculos vão junto por cascata — quem tinha só ele fica sem permissão. */
export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: roleKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: roleKeys.list() });
      void queryClient.invalidateQueries({ queryKey: userKeys.list() });
    },
  });
}
