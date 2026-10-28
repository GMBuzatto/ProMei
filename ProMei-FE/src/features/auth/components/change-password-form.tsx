"use client";

import { KeyRound, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasSession } from "@/lib/api";
import { LOGIN_ROUTE } from "@/lib/routes";
import { useChangePassword } from "@/features/auth/hooks";
import { changePasswordSchema, MIN_PASSWORD_LENGTH } from "@/features/auth/schemas";

type FieldErrors = Partial<Record<"currentPassword" | "newPassword" | "confirmPassword", string>>;

/**
 * Troca de senha obrigatória no primeiro acesso (RF-04).
 *
 * É a única tela que um usuário com `must_change_password` consegue usar: a API libera
 * `POST /auth/change-password` e recusa todo o resto com 403. Por isso ela vive fora do
 * painel — renderizar a sidebar aqui só ofereceria links que devolveriam erro.
 */
export function ChangePasswordForm() {
  const router = useRouter();

  const currentId = useId();
  const newId = useId();
  const confirmId = useId();
  const currentErrorId = useId();
  const newErrorId = useId();
  const confirmErrorId = useId();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { mutate: submit, isPending, error } = useChangePassword();

  // A rota exige sessão (a API responde 401 sem token). Quem chega aqui sem sessão vai
  // para o login em vez de encarar um formulário que só saberia falhar.
  useEffect(() => {
    if (!hasSession()) router.replace(LOGIN_ROUTE);
  }, [router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const result = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!result.success) {
      const collected: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in collected)) {
          Object.assign(collected, { [field]: issue.message });
        }
      }
      setFieldErrors(collected);
      return;
    }

    setFieldErrors({});
    // `confirmPassword` fica de fora: a API roda `forbidNonWhitelisted` e recusaria o extra.
    submit({
      currentPassword: result.data.currentPassword,
      newPassword: result.data.newPassword,
    });
  }

  return (
    <div className="w-full max-w-[480px]">
      <header className="mb-8 space-y-2">
        <span className="bg-surface-selected text-text-brand mb-2 flex h-12 w-12 items-center justify-center rounded-lg">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Defina uma nova senha</h1>
        <p className="text-text-secondary text-sm leading-relaxed">
          Sua senha atual foi definida por um administrador. Para continuar, escolha uma senha que
          só você conheça.
        </p>
      </header>

      <form noValidate onSubmit={handleSubmit}>
        <fieldset disabled={isPending} className="min-w-0 space-y-6">
          <PasswordField
            id={currentId}
            errorId={currentErrorId}
            label="Senha atual"
            autoComplete="current-password"
            value={currentPassword}
            error={fieldErrors.currentPassword}
            onChange={(value) => {
              setCurrentPassword(value);
              if (fieldErrors.currentPassword) {
                setFieldErrors((prev) => ({ ...prev, currentPassword: undefined }));
              }
            }}
          />

          <PasswordField
            id={newId}
            errorId={newErrorId}
            label="Nova senha"
            autoComplete="new-password"
            hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
            value={newPassword}
            error={fieldErrors.newPassword}
            onChange={(value) => {
              setNewPassword(value);
              if (fieldErrors.newPassword) {
                setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
              }
            }}
          />

          <PasswordField
            id={confirmId}
            errorId={confirmErrorId}
            label="Repita a nova senha"
            autoComplete="new-password"
            value={confirmPassword}
            error={fieldErrors.confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              if (fieldErrors.confirmPassword) {
                setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }
            }}
          />

          <ApiErrorAlert error={error} />

          <Button
            type="submit"
            loading={isPending}
            loadingText="Salvando..."
            className="h-12 w-full rounded-xl text-base font-semibold"
          >
            Salvar nova senha
          </Button>

          <p className="text-text-tertiary text-center text-xs leading-relaxed">
            Por segurança, todas as sessões abertas serão encerradas e você entrará de novo com a
            nova senha.
          </p>
        </fieldset>
      </form>
    </div>
  );
}

function PasswordField({
  id,
  errorId,
  label,
  value,
  error,
  hint,
  autoComplete,
  onChange,
}: {
  id: string;
  errorId: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock
          className="text-text-tertiary pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="password"
          autoComplete={autoComplete}
          className="h-12 rounded-xl pl-12"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {error ? (
        <p id={errorId} className="text-text-danger text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="text-text-tertiary text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
