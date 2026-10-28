"use client";

import type { ReactNode } from "react";
import { usePermissions } from "@/features/auth/use-permissions";

type PermissionGateProps = {
  permissions: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Renderiza conteúdo apenas se o usuário tem a permissão requerida.
 *
 * **Não é barreira de segurança** — é só UX para esconder ações que a API
 * rejeitaria de qualquer forma. Toda validação real acontece no servidor.
 *
 * @example
 * <PermissionGate permissions="itens:criar">
 *   <Button>Criar item</Button>
 * </PermissionGate>
 */
export function PermissionGate({ permissions, children, fallback = null }: PermissionGateProps) {
  const hasPermission = usePermissions(permissions);
  return hasPermission ? children : fallback;
}
