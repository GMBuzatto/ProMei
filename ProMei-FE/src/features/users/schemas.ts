import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/schemas";
import { USER_STATUSES } from "./types";

/**
 * Schemas dos formulários de usuário. Espelham `CreateUserDto`/`UpdateUserDto` da API.
 *
 * Validar aqui é UX: a API revalida tudo e é ela quem decide (docs/09-seguranca.md).
 */

const emailSchema = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .pipe(z.email("Informe um e-mail válido."));

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);

/**
 * Criação (`POST /users`).
 *
 * `roleId` é opcional na API — sem papel o usuário nasce sem permissão nenhuma —, mas o
 * formulário exige escolher: cadastrar alguém que não consegue fazer nada é um chamado de
 * suporte disfarçado de sucesso.
 */
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  roleId: z.string().min(1, "Escolha o papel deste usuário."),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;

/** Edição (`PATCH /users/:id` + vínculo de papel, que é rota separada). */
export const editUserSchema = z.object({
  email: emailSchema,
  status: z.enum(USER_STATUSES),
  /** Vazio = manter sem papel; a troca vira desvincular + vincular. */
  roleId: z.string(),
});

export type EditUserFormValues = z.infer<typeof editUserSchema>;

export type UserFormErrors = Partial<Record<"email" | "password" | "roleId" | "status", string>>;

/** Achata os erros do zod no formato que os formulários desta feature consomem. */
export function toFormErrors(error: z.ZodError): UserFormErrors {
  const errors: UserFormErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    if (field in errors) continue;

    errors[field as keyof UserFormErrors] = issue.message;
  }

  return errors;
}
