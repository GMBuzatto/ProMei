"use client";

import { UserMinus } from "lucide-react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { isLastAdminError } from "../errors";
import { useDeactivateUser } from "../hooks";
import type { CompanyUser } from "../types";

/**
 * Desativação de usuário.
 *
 * A API **não exclui** usuário: `DELETE /users/:id` desativa, porque há movimentações de
 * estoque e trilha de auditoria apontando para ele (RNF-06) — apagá-lo deixaria histórico
 * órfão. O diálogo diz isso em vez de prometer exclusão e entregar outra coisa.
 *
 * O efeito colateral que interessa a quem administra: a vaga no plano é liberada na hora, já
 * que só usuário ativo conta no limite (RN-14).
 */
export function UserDeactivateDialog({
  user,
  open,
  onClose,
}: {
  user: CompanyUser;
  open: boolean;
  onClose: () => void;
}) {
  const { mutate: deactivate, isPending, error, reset } = useDeactivateUser();

  function close() {
    if (isPending) return;
    reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Desativar usuário"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={isPending}
            loadingText="Desativando..."
            className="bg-status-danger-icon hover:bg-status-danger-text active:bg-status-danger-text text-text-inverse"
            onClick={() => deactivate(user.id, { onSuccess: close })}
          >
            Desativar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="border-status-danger-border bg-status-danger-bg flex h-14 w-14 items-center justify-center rounded-full border">
            <UserMinus className="text-status-danger-icon h-6 w-6" aria-hidden="true" />
          </span>

          <p className="text-foreground text-base font-medium">
            Desativar o acesso de {user.email}?
          </p>
          <p className="text-text-secondary text-sm leading-relaxed">
            Ele perde o acesso ao sistema, mas <strong>não é excluído</strong>: as movimentações e a
            trilha de auditoria continuam apontando para ele. Você pode reativá-lo depois, e a vaga
            dele no plano fica livre enquanto isso.
          </p>
        </div>

        {isLastAdminError(error) ? (
          <div
            role="alert"
            className="bg-status-danger-bg border-status-danger-border rounded-md border p-4"
          >
            <p className="text-status-danger-text text-sm">
              Este é o último Admin ativo da empresa e não pode ser desativado (RN-04). Promova
              outro usuário a Admin e tente de novo.
            </p>
          </div>
        ) : (
          <ApiErrorAlert error={error} />
        )}
      </div>
    </Dialog>
  );
}
