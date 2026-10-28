import { z } from "zod";

/**
 * Schema do formulário de papel. Espelha `CreateRoleDto`/`UpdateRoleDto` da API.
 *
 * Validar aqui é UX: a API revalida tudo e é ela quem decide (docs/09-seguranca.md).
 */

/** Mesmos limites do `class-validator` na API. */
export const ROLE_NAME_MIN = 2;
export const ROLE_NAME_MAX = 50;

export const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(ROLE_NAME_MIN, `O nome deve ter ao menos ${ROLE_NAME_MIN} caracteres.`)
    .max(ROLE_NAME_MAX, `O nome deve ter no máximo ${ROLE_NAME_MAX} caracteres.`),
  /**
   * A API aceita papel sem permissão nenhuma, e o formulário também: é um papel válido —
   * alguém que entra e não faz nada — e bloquear aqui impediria criar o papel antes de
   * decidir o que ele pode.
   */
  permissions: z.array(z.string()),
});

export type RoleFormValues = z.infer<typeof roleSchema>;
