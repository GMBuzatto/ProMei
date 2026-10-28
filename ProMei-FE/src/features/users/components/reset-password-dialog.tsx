"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/schemas";
import { useResetUserPassword } from "../hooks";
import { generateTemporaryPassword } from "../password";
import type { CompanyUser } from "../types";
import { CredentialsPanel } from "./credentials-panel";

/**
 * Reset de senha pelo Admin (RF-04) — sem e-mail no MVP.
 *
 * O Admin define a senha e a repassa por fora; o usuário é obrigado a trocá-la no primeiro
 * acesso. Como na criação, a senha nasce gerada e só é exibida depois de aplicada: antes
 * disso ela ainda pode mudar, e mostrar a senha "que talvez seja" convidaria a anotar a errada.
 */
export function ResetPasswordDialog({
  user,
  open,
  onClose,
}: {
  user: CompanyUser;
  open: boolean;
  onClose: () => void;
}) {
  const reset = useResetUserPassword();
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  const [applied, setApplied] = useState<string | null>(null);

  const tooShort = password.length < MIN_PASSWORD_LENGTH;

  function close() {
    if (reset.isPending) return;

    reset.reset();
    setPassword(generateTemporaryPassword());
    setApplied(null);
    onClose();
  }

  if (applied) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title="Senha redefinida"
        description={user.email}
        footer={
          <Button type="button" onClick={close}>
            Concluir
          </Button>
        }
      >
        <CredentialsPanel email={user.email} password={applied} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Resetar senha"
      description={`Define uma senha temporária para ${user.email}.`}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close} disabled={reset.isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={reset.isPending}
            loadingText="Aplicando..."
            disabled={tooShort}
            onClick={() =>
              reset.mutate(
                { userId: user.id, newPassword: password },
                { onSuccess: () => setApplied(password) },
              )
            }
          >
            Resetar senha
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-text-secondary text-sm leading-relaxed">
          A senha atual é descartada e as sessões abertas dele deixam de valer. Ele entra com a
          senha abaixo e escolhe uma nova no primeiro acesso.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="reset-password">Nova senha temporária</Label>
          <div className="flex gap-2">
            <Input
              id="reset-password"
              className="font-mono"
              autoComplete="off"
              value={password}
              disabled={reset.isPending}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={tooShort}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={reset.isPending}
              onClick={() => setPassword(generateTemporaryPassword())}
              aria-label="Gerar outra senha temporária"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {tooShort ? (
            <p className="text-status-danger-text text-sm">
              A senha deve ter ao menos {MIN_PASSWORD_LENGTH} caracteres.
            </p>
          ) : null}
        </div>

        <ApiErrorAlert error={reset.error} />
      </div>
    </Dialog>
  );
}
