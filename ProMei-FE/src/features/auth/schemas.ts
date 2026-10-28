import { z } from "zod";

/**
 * Validação do formulário de login. Existe só para melhorar a UX — quem decide se a
 * credencial vale é a API (docs/09-seguranca.md). Quando o back-end publicar seus schemas
 * compartilhados, este arquivo deve passar a reaproveitá-los em vez de redeclarar as regras.
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, "Informe seu e-mail.").pipe(z.email("Informe um e-mail válido.")),
  password: z.string().min(1, "Informe sua senha."),
  rememberMe: z.boolean().default(false),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** Política mínima de senha da API (`MIN_PASSWORD_LENGTH` em auth/dto/change-password.dto.ts). */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Troca de senha pelo próprio usuário (RF-04) — `POST /auth/change-password`.
 *
 * A confirmação existe só na tela: a API recebe `{ currentPassword, newPassword }` e o
 * `ValidationPipe` roda com `forbidNonWhitelisted`, então mandar um campo a mais devolve 400.
 * Por isso o `confirmPassword` é validado aqui e descartado antes do envio.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe sua senha atual."),
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      ),
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  })
  // A API recusa com `SENHA_INVALIDA`; avisar antes evita gastar uma requisição para
  // descobrir algo que dá para saber na hora.
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ["newPassword"],
    message: "A nova senha precisa ser diferente da atual.",
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
