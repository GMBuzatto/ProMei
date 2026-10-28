"use client";

import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useRoles } from "@/features/roles/hooks";
import { ADMIN_ROLE } from "@/features/roles/types";
import { isEmailTakenError, isPlanLimitError } from "../errors";
import { useCreateUser, useSetUserRole, useUpdateUser } from "../hooks";
import { generateTemporaryPassword } from "../password";
import { countActiveUsers, isLastActiveAdmin } from "../rules";
import { createUserSchema, editUserSchema, toFormErrors, type UserFormErrors } from "../schemas";
import type { CompanyUser } from "../types";
import { CredentialsPanel } from "./credentials-panel";
import { PlanLimitAlert } from "./plan-limit-alert";
import { USER_STATUS_OPTIONS } from "./user-status-options";

const USERS_ROUTE = "/users";

/** Mensagem própria: o e-mail é único **globalmente** na API, não por empresa. */
const EMAIL_TAKEN = "Este e-mail já está cadastrado na plataforma. Use outro.";

/**
 * Formulário de usuário — criação e edição na mesma tela, como em itens.
 *
 * Na **criação** a senha temporária nasce gerada (RF-04: sem e-mail no MVP, alguém precisa
 * entregá-la em mãos) e continua editável; ao concluir, as credenciais aparecem **uma única
 * vez** — a API guarda só o hash e nem ela consegue exibi-las de novo.
 *
 * Na **edição** são duas rotas diferentes da API — `PATCH /users/:id` para e-mail e status,
 * `/roles/users/:userId` para o vínculo de papel —, mas para quem edita é uma coisa só: a tela
 * faz as chamadas na ordem e relata o que falhou.
 *
 * A RN-04 é aplicada **antes** do envio: sendo este o último Admin ativo, desativar e trocar
 * de papel ficam bloqueados com o motivo à vista. A API recusaria de qualquer forma
 * (`ULTIMO_ADMIN`) — o que a tela evita é descobrir isso depois de tentar.
 */
export function UserForm({ user, users = [] }: { user?: CompanyUser; users?: CompanyUser[] }) {
  const router = useRouter();
  const isEditing = user !== undefined;

  const emailId = useId();
  const roleId_ = useId();
  const statusId = useId();
  const passwordId = useId();

  const { data: roles = [] } = useRoles();
  const create = useCreateUser();
  const update = useUpdateUser(user?.id ?? "");
  const setRole = useSetUserRole();

  const currentRoles = roles.filter((role) => user?.roles.includes(role.name));
  const currentRoleId = currentRoles[0]?.id ?? "";

  const [email, setEmail] = useState(user?.email ?? "");
  const [status, setStatus] = useState(user?.status ?? "ACTIVE");
  const [roleId, setRoleId] = useState("");
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  const [errors, setErrors] = useState<UserFormErrors>({});
  /** Credenciais do usuário recém-criado: a senha só existe em texto aqui. */
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  // Os papéis chegam depois do primeiro render (são outra requisição): o valor inicial do
  // select só é conhecido quando a lista existe.
  const [roleTouched, setRoleTouched] = useState(false);
  const selectedRoleId = roleTouched ? roleId : (currentRoleId ?? "");

  const lastAdmin = isEditing && isLastActiveAdmin(users, user);
  const activeUsers = countActiveUsers(users);
  const isPending = create.isPending || update.isPending || setRole.isPending;
  const error = create.error ?? update.error ?? setRole.error;
  const emailError = errors.email ?? (isEmailTakenError(error) ? EMAIL_TAKEN : undefined);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    if (!isEditing) {
      const parsed = createUserSchema.safeParse({ email, password, roleId: selectedRoleId });
      if (!parsed.success) {
        setErrors(toFormErrors(parsed.error));
        return;
      }

      setErrors({});
      create.mutate(parsed.data, {
        onSuccess: (saved) => setCreated({ email: saved.email, password: parsed.data.password }),
      });
      return;
    }

    const parsed = editUserSchema.safeParse({ email, status, roleId: selectedRoleId });
    if (!parsed.success) {
      setErrors(toFormErrors(parsed.error));
      return;
    }

    setErrors({});

    const changedFields = {
      ...(parsed.data.email !== user.email ? { email: parsed.data.email } : {}),
      ...(parsed.data.status !== user.status ? { status: parsed.data.status } : {}),
    };

    try {
      // E-mail/status primeiro: se o limite do plano barrar a reativação, o papel não muda
      // sozinho e o usuário não fica num estado que ninguém pediu.
      if (Object.keys(changedFields).length > 0) {
        await update.mutateAsync(changedFields);
      }

      if (parsed.data.roleId !== currentRoleId) {
        await setRole.mutateAsync({
          userId: user.id,
          roleId: parsed.data.roleId,
          currentRoleIds: currentRoles.map((role) => role.id),
        });
      }

      router.push(USERS_ROUTE);
    } catch {
      // O erro já está nas mutações e é exibido no rodapé do formulário. Navegar aqui
      // esconderia a recusa e faria parecer que salvou.
    }
  }

  if (created) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-6">
            <header className="space-y-1">
              <h2 className="text-foreground text-lg font-semibold">Usuário criado</h2>
              <p className="text-text-secondary text-sm">
                Repasse as credenciais abaixo. Depois desta tela a senha não pode mais ser exibida.
              </p>
            </header>

            <CredentialsPanel email={created.email} password={created.password} />
          </CardContent>

          <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t p-5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                // Novo cadastro do zero: senha nova, campos limpos.
                create.reset();
                setEmail("");
                setRoleTouched(false);
                setRoleId("");
                setPassword(generateTemporaryPassword());
                setCreated(null);
              }}
            >
              Cadastrar outro
            </Button>
            <Button type="button" onClick={() => router.push(USERS_ROUTE)}>
              Concluir
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar
      </Button>

      <form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <Card>
          <CardContent className="space-y-6">
            <fieldset disabled={isPending} className="min-w-0 space-y-6">
              <header className="space-y-1">
                <h2 className="text-foreground text-lg font-semibold">
                  {isEditing ? "Dados do usuário" : "Novo usuário"}
                </h2>
                <p className="text-text-secondary text-sm">
                  {isEditing
                    ? "E-mail, papel e situação. A senha é tratada pelo reset, na listagem."
                    : "Ele entra com uma senha temporária e escolhe a própria no primeiro acesso."}
                </p>
              </header>

              {lastAdmin ? <LastAdminNotice /> : null}

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={emailId} className="block text-left">
                    E-mail <RequiredMark />
                  </Label>
                  <Input
                    id={emailId}
                    name="email"
                    type="email"
                    autoComplete="off"
                    placeholder="pessoa@suaempresa.com.br"
                    value={email}
                    aria-invalid={emailError ? true : undefined}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <FieldError message={emailError} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={roleId_} className="block text-left">
                    Papel {isEditing ? null : <RequiredMark />}
                  </Label>
                  <Select
                    id={roleId_}
                    value={selectedRoleId}
                    aria-invalid={errors.roleId ? true : undefined}
                    onChange={(event) => {
                      setRoleTouched(true);
                      setRoleId(event.target.value);
                    }}
                  >
                    <option value="">{isEditing ? "Sem papel" : "Escolha um papel..."}</option>
                    {roles.map((role) => (
                      <option
                        key={role.id}
                        value={role.id}
                        // RN-04: tirar o Admin do último Admin ativo deixa a empresa sem comando.
                        disabled={lastAdmin && role.name !== ADMIN_ROLE}
                      >
                        {role.name}
                      </option>
                    ))}
                  </Select>
                  <FieldError message={errors.roleId} />
                  <p className="text-text-tertiary text-xs">
                    O papel define o que a pessoa pode fazer. Sem papel, ela entra e não faz nada.
                  </p>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <Label htmlFor={statusId} className="block text-left">
                      Situação
                    </Label>
                    <Select
                      id={statusId}
                      value={status}
                      onChange={(event) => setStatus(event.target.value as CompanyUser["status"])}
                    >
                      {USER_STATUS_OPTIONS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={lastAdmin && option.value === "INACTIVE"}
                        >
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    {user.status === "INACTIVE" ? (
                      <p className="text-text-tertiary text-xs">
                        Reativar ocupa uma vaga do plano. Só usuário ativo conta no limite.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor={passwordId} className="block text-left">
                      Senha temporária <RequiredMark />
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id={passwordId}
                        name="password"
                        className="font-mono"
                        autoComplete="off"
                        value={password}
                        aria-invalid={errors.password ? true : undefined}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setPassword(generateTemporaryPassword())}
                        aria-label="Gerar outra senha temporária"
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <FieldError message={errors.password} />
                    <p className="text-text-tertiary text-xs">
                      Ela aparece uma única vez, depois de criar. O usuário troca no primeiro
                      acesso.
                    </p>
                  </div>
                )}
              </div>

              {isPlanLimitError(error) ? (
                <PlanLimitAlert activeUsers={activeUsers} />
              ) : isEmailTakenError(error) ? null : (
                <ApiErrorAlert error={error} />
              )}
            </fieldset>
          </CardContent>

          <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t p-5">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => router.push(USERS_ROUTE)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isPending}
              loadingText={isEditing ? "Salvando..." : "Criando usuário..."}
            >
              {isEditing ? "Salvar alterações" : "Criar usuário"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

function LastAdminNotice() {
  return (
    <div className="border-status-warning-border bg-status-warning-bg flex gap-3 rounded-md border p-3">
      <ShieldAlert
        className="text-status-warning-icon mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
      />
      <p className="text-status-warning-text text-sm">
        Este é o último Admin ativo da empresa. Enquanto for, ele não pode ser desativado nem trocar
        de papel. Promova outro usuário a Admin antes.
      </p>
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="text-text-danger" title="Campo obrigatório">
      *
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-text-danger text-xs">{message}</p>;
}
