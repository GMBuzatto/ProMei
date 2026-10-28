"use client";

import { KeyRound, Pencil, Search, UserMinus, UserPlus, Users as UsersIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { ListEmptyState } from "@/components/list-empty-state";
import { TableSkeletonRows } from "@/components/table-skeleton-rows";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { useUser as useCurrentUser } from "@/features/auth/context";
import { usePermissions } from "@/features/auth/use-permissions";
import { useRoles } from "@/features/roles/hooks";
import { cn } from "@/lib/utils";
import { isPlanLimitError } from "../errors";
import { useUpdateUser, useUsers } from "../hooks";
import { countActiveAdmins, countActiveUsers, filterUsers, isLastActiveAdmin } from "../rules";
import { USER_STATUSES, userInitials, type CompanyUser, type UserStatus } from "../types";
import { PlanLimitAlert } from "./plan-limit-alert";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { RoleBadges, UserStatusBadge, userStatusLabel } from "./user-badges";
import { UserDeactivateDialog } from "./user-deactivate-dialog";

/**
 * Equipe da empresa (RN-02): quem tem acesso, com que papel e em que situação.
 *
 * Busca e filtros são **do cliente** porque `GET /users` devolve a lista inteira, sem query de
 * busca nem paginação — diferente de itens. Como o público é um MEI com poucos usuários, isso
 * é o catálogo inteiro na tela, e não uma amostra: o rodapé diz quantos há.
 *
 * A API não tem nome nem cargo de usuário (`UserResponseDto` é e-mail, status, papéis e data),
 * então a tela identifica pessoas pelo e-mail. As colunas "Cargo" e "Último acesso" do mockup
 * ficam de fora até existirem no contrato — preenchê-las com placeholder seria inventar dado.
 *
 * O limite de usuários do plano (RN-14) **não é legível pelo tenant**: assinaturas são rota de
 * plataforma. Por isso a tela mostra quantos ativos existem e, quando a API recusa o cadastro,
 * explica o limite e as saídas em vez de repassar a mensagem crua da API.
 */
export function UsersList() {
  const { data: users = [], isPending, error } = useUsers();
  const { user: currentUser } = useCurrentUser();

  // Listar papéis é outra permissão (`roles:read`). Sem ela o filtro ainda funciona: os nomes
  // vêm dos próprios usuários — só não aparece papel que ninguém tem ainda.
  const { data: roles = [] } = useRoles(usePermissions("roles:read"));

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState<UserStatus | "ALL">("ALL");
  /** Recusa por limite do plano vinda de uma reativação — o aviso mora no topo da lista. */
  const [planLimitHit, setPlanLimitHit] = useState(false);

  const visible = useMemo(
    () => filterUsers(users, { search, role, status }),
    [users, search, role, status],
  );

  const activeUsers = countActiveUsers(users);
  const activeAdmins = countActiveAdmins(users);

  /** Papéis do select: os que existem na empresa, mais os que aparecem na lista. */
  const roleOptions = useMemo(() => {
    const names = new Set(roles.map((entry) => entry.name));
    for (const user of users) for (const name of user.roles) names.add(name);
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [roles, users]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-text-secondary text-sm">
            Gerencie quem tem acesso ao sistema e o que cada um pode fazer.
          </p>
        </div>

        <PermissionGate permissions="users:create">
          <Link href="/users/new" className={buttonVariants()}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Novo usuário
          </Link>
        </PermissionGate>
      </header>

      {planLimitHit ? <PlanLimitAlert activeUsers={activeUsers} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Usuários ativos"
          value={activeUsers}
          hint="Só eles ocupam vaga no plano."
        />
        <StatTile
          label="Admins ativos"
          value={activeAdmins}
          hint="A empresa precisa de ao menos 1."
        />
        <StatTile
          label="Inativos"
          value={users.length - activeUsers}
          hint="Mantêm o histórico e podem voltar."
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-border flex flex-wrap items-end gap-3 border-b p-4">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="user-search">Buscar</Label>
            <div className="relative">
              <Search
                className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id="user-search"
                className="pl-9"
                placeholder="E-mail..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="min-w-44 space-y-1.5">
            <Label htmlFor="user-role-filter">Papel</Label>
            <Select
              id="user-role-filter"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="ALL">Todos</option>
              {roleOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-40 space-y-1.5">
            <Label htmlFor="user-status-filter">Situação</Label>
            <Select
              id="user-status-filter"
              value={status}
              onChange={(event) => setStatus(event.target.value as UserStatus | "ALL")}
            >
              <option value="ALL">Todas</option>
              {USER_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {userStatusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ApiErrorAlert error={error} />
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <thead>
              <tr className="border-border border-b">
                <Th>Usuário</Th>
                <Th>Papel</Th>
                <Th>Situação</Th>
                <Th>Desde</Th>
                <Th className="pr-7 text-right">Ações</Th>
              </tr>
            </thead>

            <tbody>
              {isPending ? <SkeletonRows /> : null}

              {!isPending && visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12">
                    <EmptyState filtering={users.length > 0} />
                  </td>
                </tr>
              ) : null}

              {visible.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  users={users}
                  isCurrent={user.id === currentUser?.sub}
                  onPlanLimit={() => setPlanLimitHit(true)}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-border border-t p-4">
          <p className="text-text-secondary text-sm">
            {visible.length === users.length
              ? `${users.length} ${users.length === 1 ? "usuário" : "usuários"}`
              : `${visible.length} de ${users.length} usuários`}
          </p>
        </div>
      </Card>
    </div>
  );
}

type RowDialog = "reset" | "deactivate" | null;

function UserRow({
  user,
  users,
  isCurrent,
  onPlanLimit,
}: {
  user: CompanyUser;
  users: CompanyUser[];
  isCurrent: boolean;
  onPlanLimit: () => void;
}) {
  const [dialog, setDialog] = useState<RowDialog>(null);
  const canUpdate = usePermissions("users:update");
  const canDelete = usePermissions("users:delete");
  const reactivate = useUpdateUser(user.id);

  const lastAdmin = isLastActiveAdmin(users, user);

  return (
    <tr className="border-border hover:bg-surface-hover border-b transition-colors last:border-b-0 motion-reduce:transition-none">
      <Td>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-background-subtle text-text-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          >
            {userInitials(user.email)}
          </span>

          <div className="min-w-0">
            <p className="text-foreground flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="break-all">{user.email}</span>
              {isCurrent ? <Badge variant="info">Você</Badge> : null}
            </p>
            {/* RF-04: senha definida por outra pessoa, ainda não trocada. */}
            {user.mustChangePassword ? (
              <p className="text-text-tertiary text-xs">Senha temporária pendente de troca</p>
            ) : null}
          </div>
        </div>
      </Td>
      <Td>
        <RoleBadges roles={user.roles} />
      </Td>
      <Td>
        <UserStatusBadge status={user.status} />
      </Td>
      <Td>
        <span className="text-text-secondary">
          {new Date(user.createdAt).toLocaleDateString("pt-BR")}
        </span>
      </Td>
      <Td className="text-right">
        <div className="flex flex-wrap justify-end gap-1">
          {canUpdate ? (
            <>
              <Link
                href={`/users/${user.id}/edit`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                aria-label={`Editar ${user.email}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Editar
              </Link>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDialog("reset")}
                aria-label={`Resetar a senha de ${user.email}`}
                title="Resetar senha"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ) : null}

          {user.status === "INACTIVE" && canUpdate ? (
            <Button
              variant="secondary"
              size="sm"
              loading={reactivate.isPending}
              loadingText="Reativando..."
              onClick={() =>
                reactivate.mutate(
                  { status: "ACTIVE" },
                  {
                    // Reativar ocupa vaga: é o outro caminho que esbarra na RN-14.
                    onError: (error) => isPlanLimitError(error) && onPlanLimit(),
                  },
                )
              }
            >
              Reativar
            </Button>
          ) : null}

          {user.status === "ACTIVE" && canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={lastAdmin}
              onClick={() => setDialog("deactivate")}
              aria-label={`Desativar ${user.email}`}
              title={
                lastAdmin
                  ? "Último Admin ativo: promova outro antes de desativar (RN-04)"
                  : "Desativar"
              }
            >
              <UserMinus className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {dialog === "reset" ? (
          <ResetPasswordDialog user={user} open onClose={() => setDialog(null)} />
        ) : null}
        {dialog === "deactivate" ? (
          <UserDeactivateDialog user={user} open onClose={() => setDialog(null)} />
        ) : null}
      </Td>
    </tr>
  );
}

function StatTile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="p-4">
      <p className="text-text-secondary text-sm">{label}</p>
      <p className="text-foreground text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-text-tertiary text-xs">{hint}</p>
    </Card>
  );
}

function EmptyState({ filtering }: { filtering: boolean }) {
  return (
    <ListEmptyState
      icon={UsersIcon}
      title={filtering ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
      description={
        filtering ? "Ajuste a busca ou os filtros." : "Cadastre quem vai usar o sistema com você."
      }
    />
  );
}

function SkeletonRows() {
  return <TableSkeletonRows colSpan={5} label="Carregando usuários..." rows={4} />;
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "text-text-secondary px-4 py-3 text-xs font-medium tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-4 text-sm", className)}>{children}</td>;
}
