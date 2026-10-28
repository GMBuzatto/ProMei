"use client";

import { ArrowLeft, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRoleNameTakenError, isSystemRoleError } from "../errors";
import { useCreateRole, usePermissionCatalog, useUpdateRole } from "../hooks";
import { buildPermissionMatrix, unknownPermissions, type Permission } from "../matrix";
import { roleSchema } from "../schemas";
import type { Role } from "../types";
import { PermissionMatrix } from "./permission-matrix";

const ROLES_ROUTE = "/roles";
const NAME_TAKEN = "Já existe um papel com este nome nesta empresa.";

/**
 * Formulário de papel — criação e edição na mesma tela (RF-12).
 *
 * **Papel de sistema não é editável** (aceite desta entrega): Admin e Colaborador nascem com a
 * empresa e a API recusa alterá-los com `PAPEL_DE_SISTEMA_IMUTAVEL`. Aqui isso vira tela de
 * leitura — nome e matriz visíveis, tudo desabilitado, sem botão de salvar —, porque ver o que
 * o papel concede é útil mesmo sem poder mudar. Esconder seria pior que desabilitar.
 *
 * `permissions` no `PATCH` **substitui** o conjunto inteiro, então o formulário envia sempre a
 * seleção completa: mandar só a diferença apagaria o resto.
 */
export function RoleForm({ role }: { role?: Role }) {
  const router = useRouter();
  const isEditing = role !== undefined;
  const isSystem = role?.isSystem ?? false;

  const nameId = useId();

  const { data: catalog = [], isPending: loadingCatalog } = usePermissionCatalog();
  const create = useCreateRole();
  const update = useUpdateRole(role?.id ?? "");

  const [name, setName] = useState(role?.name ?? "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [selected, setSelected] = useState<Set<Permission>>(() => new Set(role?.permissions ?? []));

  const matrix = useMemo(() => buildPermissionMatrix(catalog), [catalog]);

  /**
   * Permissões que o papel guarda e o catálogo não oferece mais. Reenviá-las derrubaria o
   * `PATCH` inteiro com `PERMISSAO_INEXISTENTE`, então elas ficam de fora do envio — e a tela
   * diz quais são, para a mudança não acontecer em silêncio.
   */
  const orphans = useMemo(
    () => (catalog.length > 0 ? unknownPermissions(selected, catalog) : []),
    [selected, catalog],
  );

  const mutation = isEditing ? update : create;
  const error = mutation.error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || isSystem) return;

    const known = [...selected].filter((permission) => !orphans.includes(permission));
    const parsed = roleSchema.safeParse({ name, permissions: known });

    if (!parsed.success) {
      setNameError(parsed.error.issues.find((issue) => issue.path[0] === "name")?.message);
      return;
    }

    setNameError(undefined);
    mutation.mutate(parsed.data, { onSuccess: () => router.push(ROLES_ROUTE) });
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

      <form noValidate onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-6">
            <fieldset disabled={mutation.isPending || isSystem} className="min-w-0 space-y-6">
              <header className="space-y-1">
                <h2 className="text-foreground text-lg font-semibold">
                  {isEditing ? "Dados do papel" : "Novo papel"}
                </h2>
                <p className="text-text-secondary text-sm">
                  O papel é um conjunto de permissões. Quem o tiver poderá fazer exatamente o que
                  estiver marcado abaixo.
                </p>
              </header>

              {isSystem ? <SystemRoleNotice /> : null}

              <div className="max-w-sm space-y-2">
                <Label htmlFor={nameId} className="block text-left">
                  Nome
                </Label>
                <Input
                  id={nameId}
                  name="name"
                  placeholder="Ex: Estoquista"
                  value={name}
                  aria-invalid={nameError ? true : undefined}
                  onChange={(event) => setName(event.target.value)}
                />
                {nameError ? <p className="text-text-danger text-xs">{nameError}</p> : null}
                {isRoleNameTakenError(error) ? (
                  <p className="text-text-danger text-xs">{NAME_TAKEN}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <h3 className="text-foreground text-sm font-medium">Permissões</h3>

                {loadingCatalog ? (
                  <div
                    role="status"
                    aria-busy="true"
                    className="border-border bg-background-subtle h-72 animate-pulse rounded-lg border motion-reduce:animate-none"
                  >
                    <span className="sr-only">Carregando o catálogo de permissões...</span>
                  </div>
                ) : (
                  <PermissionMatrix
                    matrix={matrix}
                    selected={selected}
                    onChange={setSelected}
                    disabled={isSystem}
                  />
                )}

                {orphans.length > 0 ? (
                  <p className="text-status-warning-text text-xs">
                    Este papel guarda {orphans.length}{" "}
                    {orphans.length === 1 ? "permissão que a API" : "permissões que a API"} não
                    oferece mais ({orphans.join(", ")}). Ao salvar,{" "}
                    {orphans.length === 1 ? "ela será removida" : "elas serão removidas"}.
                  </p>
                ) : null}
              </div>
            </fieldset>

            {isSystemRoleError(error) ? (
              <div
                role="alert"
                className="bg-status-warning-bg border-status-warning-border rounded-md border p-4"
              >
                <p className="text-status-warning-text text-sm">
                  Este é um papel de sistema e não pode ser alterado. Crie um papel próprio com as
                  permissões que você precisa.
                </p>
              </div>
            ) : isRoleNameTakenError(error) ? null : (
              <ApiErrorAlert error={error} />
            )}
          </CardContent>

          <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t p-5">
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => router.push(ROLES_ROUTE)}
            >
              {isSystem ? "Voltar para papéis" : "Cancelar"}
            </Button>

            {isSystem ? null : (
              <Button
                type="submit"
                loading={mutation.isPending}
                loadingText={isEditing ? "Salvando..." : "Criando papel..."}
              >
                {isEditing ? "Salvar alterações" : "Criar papel"}
              </Button>
            )}
          </div>
        </Card>
      </form>
    </div>
  );
}

function SystemRoleNotice() {
  return (
    <div className="border-border bg-surface-subtle flex gap-3 rounded-md border p-4">
      <Lock className="text-text-secondary mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="text-foreground text-sm font-medium">Papel de sistema, só para consulta</p>
        <p className="text-text-secondary text-sm leading-relaxed">
          Admin e Colaborador vêm prontos com a empresa e a API não permite alterá-los: é o que
          garante que sempre exista um papel capaz de administrar a conta. Para uma combinação
          diferente de permissões, crie um papel próprio.
        </p>
      </div>
    </div>
  );
}
