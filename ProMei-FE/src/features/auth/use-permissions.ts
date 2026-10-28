"use client";

import { useUser } from "./context";
import { hasAnyPermission, isPlatformUser } from "./permissions";

/**
 * `true` quando o usuário pode executar a ação — uma permissão `recurso:ação` ou qualquer
 * uma de uma lista.
 *
 * Serve só para decidir o que desenhar. Quem autoriza de fato é a API (docs/09-seguranca.md):
 * mesmo que este hook devolva `true` por engano, a chamada volta 403.
 *
 * @example
 * const canCreate = usePermissions("companies:create");
 * const canManage = usePermissions(["items:update", "items:delete"]);
 */
export function usePermissions(permissions: string | string[]): boolean {
  const { user } = useUser();
  const required = Array.isArray(permissions) ? permissions : [permissions];

  return hasAnyPermission(user, required);
}

/**
 * `true` para Super Admin/Staff — os únicos que operam cross-tenant nas rotas de plataforma
 * (empresas, planos, assinaturas). Usuário de empresa recebe 404 nessas rotas.
 */
export function useIsPlatformUser(): boolean {
  const { user } = useUser();
  return isPlatformUser(user);
}
