"use client";

import { AlertTriangle } from "lucide-react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { isSystemRoleError } from "../errors";
import { useDeleteRole } from "../hooks";
import type { Role } from "../types";

/**
 * Exclusão de papel (RF-12).
 *
 * Papel não é inativado: sai do banco e os vínculos vão junto por cascata. A consequência que
 * o diálogo precisa dizer em voz alta é a que não se vê na tela de papéis — **quem tinha só
 * este papel fica sem permissão nenhuma** e continua entrando no sistema sem conseguir fazer
 * nada. Por isso o número de usuários afetados aparece antes de confirmar.
 */
export function RoleDeleteDialog({
  role,
  open,
  onClose,
}: {
  role: Role;
  open: boolean;
  onClose: () => void;
}) {
  const { mutate: remove, isPending, error, reset } = useDeleteRole();

  function close() {
    if (isPending) return;
    reset();
    onClose();
  }

  const users = role.usersCount ?? 0;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Excluir papel"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={isPending}
            loadingText="Excluindo..."
            className="bg-status-danger-icon hover:bg-status-danger-text active:bg-status-danger-text text-text-inverse"
            onClick={() => remove(role.id, { onSuccess: close })}
          >
            Excluir papel
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="border-status-danger-border bg-status-danger-bg flex h-14 w-14 items-center justify-center rounded-full border">
            <AlertTriangle className="text-status-danger-icon h-6 w-6" aria-hidden="true" />
          </span>

          <p className="text-foreground text-base font-medium">Excluir o papel {role.name}?</p>
          <p className="text-text-secondary text-sm leading-relaxed">
            A exclusão é definitiva e leva junto os vínculos com os usuários.
          </p>
        </div>

        <div className="border-border bg-surface-subtle rounded-lg border p-4">
          <p className="text-foreground text-sm font-semibold">{role.name}</p>
          <p className="text-text-secondary text-sm">
            {role.permissions.length} {role.permissions.length === 1 ? "permissão" : "permissões"} ·{" "}
            {users === 1 ? "1 usuário" : `${users} usuários`}
          </p>
        </div>

        {users > 0 ? (
          <div className="border-status-warning-border bg-status-warning-bg rounded-md border p-4">
            <p className="text-status-warning-text text-sm">
              {users === 1 ? "1 usuário usa" : `${users} usuários usam`} este papel. Quem não tiver
              outro papel continuará entrando no sistema, mas sem conseguir fazer nada até receber
              um novo.
            </p>
          </div>
        ) : null}

        {isSystemRoleError(error) ? (
          <div
            role="alert"
            className="bg-status-warning-bg border-status-warning-border rounded-md border p-4"
          >
            <p className="text-status-warning-text text-sm">
              Papel de sistema não pode ser excluído.
            </p>
          </div>
        ) : (
          <ApiErrorAlert error={error} />
        )}
      </div>
    </Dialog>
  );
}
