import { api } from "@/lib/api";
import type { Role } from "./types";

/** `GET /roles` — a lista inteira, sem paginação (é o que a API devolve). */
export function listRoles(options: { signal?: AbortSignal } = {}) {
  return api.get<Role[]>("/roles", { signal: options.signal });
}

/**
 * `POST /roles/users/:userId` (204) — vincula um papel a um usuário.
 *
 * Exige `users:update`, não `roles:update`: quem atribui papel está mudando o que **o
 * usuário** pode fazer.
 */
export function assignRoleToUser(userId: string, roleId: string) {
  return api.post<void>(`/roles/users/${userId}`, { roleId });
}

/**
 * `DELETE /roles/users/:userId/:roleId` (204) — desvincula.
 *
 * A API recusa tirar o papel `Admin` do último Admin ativo (RN-04) com `ULTIMO_ADMIN`.
 */
export function removeRoleFromUser(userId: string, roleId: string) {
  return api.delete<void>(`/roles/users/${userId}/${roleId}`);
}

export function getRole(id: string, options: { signal?: AbortSignal } = {}) {
  return api.get<Role>(`/roles/${id}`, { signal: options.signal });
}

export type RoleInput = {
  name: string;
  /** Conjunto **completo** de `recurso:ação`. No PATCH ele substitui o que havia. */
  permissions: string[];
};

/** `POST /roles` — RF-12. Papel novo nasce sempre `isSystem: false`. */
export function createRole(input: RoleInput) {
  return api.post<Role>("/roles", input);
}

/**
 * `PATCH /roles/:id`.
 *
 * `permissions` **substitui** o conjunto inteiro — não é merge. Papel de sistema é recusado
 * com `PAPEL_DE_SISTEMA_IMUTAVEL`.
 */
export function updateRole(id: string, input: Partial<RoleInput>) {
  return api.patch<Role>(`/roles/${id}`, input);
}

/**
 * `DELETE /roles/:id` (204).
 *
 * Não há inativação de papel: ele sai do banco e os vínculos vão junto por cascata. Quem
 * tinha só este papel **fica sem permissão nenhuma** — por isso a tela mostra quantos são
 * antes de confirmar. Papel de sistema é recusado.
 */
export function deleteRole(id: string) {
  return api.delete<void>(`/roles/${id}`);
}

/**
 * `GET /permissions` — catálogo de `recurso:ação` disponíveis (RF-12).
 *
 * É global (não tem `company_id`) e é a fonte da matriz: as linhas e colunas saem daqui, não
 * de uma lista fixa no front (docs/16-configuracao-sem-hardcode.md). Exige `roles:read`.
 */
export function listPermissionCatalog(options: { signal?: AbortSignal } = {}) {
  return api.get<string[]>("/permissions", { signal: options.signal });
}
