import { ADMIN_ROLE } from "@/features/roles/types";
import type { CompanyUser, UserStatus } from "./types";

/**
 * Regras da equipe que não dependem de React nem de rede.
 *
 * Todas são **UX**: a API revalida cada uma delas e é quem decide (docs/09-seguranca.md). O
 * que elas evitam é oferecer um botão que só levaria a um erro — no caso da RN-04, deixar o
 * Admin desativar a si mesmo e descobrir depois que a empresa ficaria sem ninguém no comando.
 */

export function isAdmin(user: Pick<CompanyUser, "roles">): boolean {
  return user.roles.includes(ADMIN_ROLE);
}

export function isActive(user: Pick<CompanyUser, "status">): boolean {
  return user.status === "ACTIVE";
}

export function countActiveUsers(users: Pick<CompanyUser, "status">[]): number {
  return users.filter(isActive).length;
}

export function countActiveAdmins(users: Pick<CompanyUser, "status" | "roles">[]): number {
  return users.filter((user) => isActive(user) && isAdmin(user)).length;
}

/**
 * RN-04: a empresa precisa manter ao menos um Admin **ativo**.
 *
 * `true` só quando desativar (ou rebaixar) este usuário deixaria a empresa sem nenhum Admin
 * ativo. Usuário já inativo nunca é o último — ele não está segurando a regra.
 */
export function isLastActiveAdmin(
  users: Pick<CompanyUser, "id" | "status" | "roles">[],
  user: Pick<CompanyUser, "id" | "status" | "roles">,
): boolean {
  if (!isActive(user) || !isAdmin(user)) return false;
  return countActiveAdmins(users) <= 1;
}

export type UserFilters = {
  /** Busca no e-mail. A API não tem nome nem cargo para procurar. */
  search: string;
  /** Nome do papel, ou `ALL`. */
  role: string;
  status: UserStatus | "ALL";
};

/**
 * Filtro da listagem, feito no cliente porque `GET /users` devolve a lista inteira, sem
 * `search` nem `status` na query — diferente de itens, onde o filtro é do servidor.
 */
export function filterUsers(users: CompanyUser[], filters: UserFilters): CompanyUser[] {
  const term = filters.search.trim().toLowerCase();

  return users.filter((user) => {
    if (filters.status !== "ALL" && user.status !== filters.status) return false;
    if (filters.role !== "ALL" && !user.roles.includes(filters.role)) return false;
    if (term.length > 0 && !user.email.toLowerCase().includes(term)) return false;

    return true;
  });
}
