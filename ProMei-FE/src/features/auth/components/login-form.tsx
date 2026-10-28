"use client";

import { CircleCheck, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { ProMeiWordmark } from "@/components/brand/promei-logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/features/auth/hooks";
import { loginSchema } from "@/features/auth/schemas";

type FieldErrors = { email?: string; password?: string };

/** Classes comuns dos dois campos: altura maior e ícone à esquerda dentro do input. */
const FIELD_CLASS = "h-14 rounded-xl pl-12 text-[15px]";
const FIELD_ICON_CLASS =
  "text-text-tertiary pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2";

export function LoginForm() {
  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const resetHintId = useId();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetHint, setShowResetHint] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [passwordJustChanged, setPasswordJustChanged] = useState(false);

  const { mutate: signIn, isPending, error } = useLogin();

  /*
   * Trocar a senha revoga todas as sessões na API, então o usuário volta obrigatoriamente
   * para cá. Sem este aviso, ele veria a tela de login de novo e concluiria que a troca
   * falhou. Lido de `window.location` em vez de `useSearchParams()` para não forçar um
   * limite de Suspense e tirar esta página do render estático.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPasswordJustChanged(params.get("senha-alterada") === "1");
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    // Validação local só de preenchimento/forma: quem julga a credencial é a API.
    const result = loginSchema.safeParse({ email, password, rememberMe: remember });

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if ((field === "email" || field === "password") && !errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setFieldErrors({});
    signIn(result.data);
  }

  return (
    <div className="w-full max-w-[520px]">
      <ProMeiWordmark size="sm" className="mb-10 md:hidden" />

      <header className="mb-9">
        <h2 className="text-foreground text-[28px] leading-9 font-bold tracking-tight">
          Bem-vindo(a) de volta! 👋
        </h2>
        <p className="text-text-secondary mt-2 text-[15px] leading-relaxed">
          Entre com suas credenciais para acessar sua conta.
        </p>
      </header>

      {passwordJustChanged ? (
        <div
          role="status"
          className="bg-status-success-bg border-status-success-border mb-6 flex gap-3 rounded-md border p-4"
        >
          <CircleCheck
            className="text-status-success-icon mt-0.5 h-5 w-5 shrink-0"
            aria-hidden="true"
          />
          <p className="text-status-success-text text-sm">
            Senha alterada com sucesso. Entre com a nova senha para continuar.
          </p>
        </div>
      ) : null}

      <form noValidate onSubmit={handleSubmit}>
        {/* `fieldset` desabilitado bloqueia todos os controles de uma vez durante o envio. */}
        <fieldset disabled={isPending} className="min-w-0 space-y-6">
          <div className="space-y-2">
            <Label htmlFor={emailId}>E-mail</Label>
            <div className="relative">
              <Mail className={FIELD_ICON_CLASS} aria-hidden="true" />
              <Input
                id={emailId}
                ref={emailRef}
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                placeholder="seu@email.com"
                className={FIELD_CLASS}
                value={email}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? emailErrorId : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
              />
            </div>
            {fieldErrors.email ? (
              <p id={emailErrorId} className="text-text-danger text-xs">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={passwordId}>Senha</Label>
            <div className="relative">
              <Lock className={FIELD_ICON_CLASS} aria-hidden="true" />
              <Input
                id={passwordId}
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                className={`${FIELD_CLASS} pr-14`}
                value={password}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                aria-controls={passwordId}
                className="text-text-tertiary hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-xl transition-colors outline-none focus-visible:ring-[3px] motion-reduce:transition-none"
              >
                {showPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.password ? (
              <p id={passwordErrorId} className="text-text-danger text-xs">
                {fieldErrors.password}
              </p>
            ) : null}

            {/*
             * Não existe recuperação de senha por e-mail no MVP: o reset é feito por um
             * administrador (RF-04 em docs/03-requisitos.md; mensageria de e-mail é RF-91,
             * pós-MVP). Por isso este controle só explica o caminho real — nenhum fluxo
             * fictício de envio, nenhuma rota inexistente.
             */}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-sm"
                aria-expanded={showResetHint}
                aria-controls={resetHintId}
                onClick={() => setShowResetHint((visible) => !visible)}
              >
                Esqueceu sua senha?
              </Button>
            </div>
            {showResetHint ? (
              <p id={resetHintId} className="text-text-tertiary text-xs leading-relaxed">
                A redefinição de senha é feita por um administrador da sua empresa. Fale com ele
                para receber uma senha nova.
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id={rememberId}
              name="remember"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <Label htmlFor={rememberId} className="text-text-secondary cursor-pointer font-normal">
              Lembrar de mim
            </Label>
          </div>

          {/* Erro do servidor: mensagem em pt-BR + `code` de negócio, sem detalhe interno. */}
          <ApiErrorAlert error={error} />

          <Button
            type="submit"
            loading={isPending}
            loadingText="Entrando..."
            className="h-14 w-full rounded-xl text-base font-semibold"
          >
            Entrar
          </Button>
        </fieldset>
      </form>

      {/*
       * Sem self-service register no MVP: empresas e usuários são criados pelo Super
       * Admin/Staff (RN-10 em docs/04-regras-de-negocio.md). Texto informativo, não link —
       * não existe rota nem canal de contato definido no front.
       */}
      <p className="text-text-secondary mt-8 text-center text-sm">
        Não possui acesso?{" "}
        <span className="text-primary font-medium">Fale com o administrador.</span>
      </p>
    </div>
  );
}
