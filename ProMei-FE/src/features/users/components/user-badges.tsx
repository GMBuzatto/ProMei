import { Badge, BadgeDot } from "@/components/ui/badge";
import { ADMIN_ROLE } from "@/features/roles/types";
import type { UserStatus } from "../types";

export function userStatusLabel(status: UserStatus): string {
  return status === "ACTIVE" ? "Ativo" : "Inativo";
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge variant={status === "ACTIVE" ? "success" : "neutral"}>
      <BadgeDot />
      {userStatusLabel(status)}
    </Badge>
  );
}

/**
 * Papel do usuário.
 *
 * Só o Admin se destaca, e por um motivo de regra, não de estética: é o papel que a RN-04
 * protege e o único que muda o que a tela permite fazer. Pintar cada papel customizado de uma
 * cor viraria semântica inventada — a empresa cria os papéis que quiser (RF-12).
 */
export function RoleBadge({ role }: { role: string }) {
  return <Badge variant={role === ADMIN_ROLE ? "info" : "neutral"}>{role}</Badge>;
}

/** Lista de papéis de uma linha. Sem papel é estado real: o usuário não faz nada no sistema. */
export function RoleBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) {
    return <span className="text-text-tertiary text-sm">Sem papel</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <RoleBadge key={role} role={role} />
      ))}
    </span>
  );
}
