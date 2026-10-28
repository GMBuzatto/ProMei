import type { AuthenticatedUser } from "@/types/user";

/**
 * Regras de autorização espelhadas do `PermissionsGuard` da API.
 *
 * **Isto é UX, não segurança.** A autoridade é a API: ela revalida tudo e responde 403
 * (`PERMISSAO_NEGADA`) ou 404 na fronteira de tenant. O que estas funções fazem é evitar
 * desenhar um botão que só levaria o usuário a um erro.
 *
 * Espelhar o servidor importa porque as duas regras dele não são a mesma coisa — e errar
 * isso esconde a UI inteira de quem tem mais poder, não de quem tem menos.
 */

/** Nome do papel que ignora a checagem de permissão (RN-01). Igual ao `SUPER_ADMIN_ROLE` da API. */
export const SUPER_ADMIN_ROLE = "Super Admin";

/**
 * Usuário de plataforma (Super Admin/Staff) não pertence a nenhuma empresa — RN-05.
 * É a fronteira que a API chama de `@PlatformRoute`: só eles acessam empresas, planos e
 * assinaturas; usuário de empresa recebe 404 nessas rotas.
 */
export function isPlatformUser(user: AuthenticatedUser | null): boolean {
  return user !== null && user.company_id === null;
}

export function isSuperAdmin(user: AuthenticatedUser | null): boolean {
  return user !== null && user.roles.includes(SUPER_ADMIN_ROLE);
}

/**
 * `true` quando o usuário pode executar a ação `recurso:ação`.
 *
 * O Super Admin passa direto, sem consultar a lista: o guard da API faz exatamente isso
 * (`if (roles.includes(SUPER_ADMIN_ROLE)) return true`), então o array `permissions` dele
 * pode vir vazio e ainda assim ele pode tudo. Checar só a lista esconderia a interface
 * inteira justamente de quem tem acesso total.
 */
export function hasPermission(user: AuthenticatedUser | null, permission: string): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return user.permissions.includes(permission);
}

/** `true` se o usuário tem **alguma** das permissões. Lista vazia = sem exigência. */
export function hasAnyPermission(user: AuthenticatedUser | null, permissions: string[]): boolean {
  if (permissions.length === 0) return true;
  return permissions.some((permission) => hasPermission(user, permission));
}
