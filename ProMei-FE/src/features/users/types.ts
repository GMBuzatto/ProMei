/**
 * Espelho dos tipos de usuários da empresa (ProMei-BE, módulo `users` — RN-02).
 *
 * Rota de tenant: o Admin gerencia apenas a própria empresa, e usuário de plataforma recebe
 * 404. Chama-se `CompanyUser` para não se confundir com o `AuthenticatedUser` das claims do
 * JWT — são coisas diferentes: um é quem está logado, o outro é uma linha da equipe.
 */

export const USER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type CompanyUser = {
  id: string;
  email: string;
  status: UserStatus;
  /**
   * Senha definida por outra pessoa (criação ou reset por Admin) — RF-04. Enquanto for
   * `true`, a API bloqueia o usuário em tudo menos a própria troca de senha.
   */
  mustChangePassword: boolean;
  /** **Nomes** dos papéis, não ids: é o que `UserResponseDto` devolve. */
  roles: string[];
  createdAt: string;
};

/**
 * A API não tem "nome" nem "cargo" de usuário: `UserResponseDto` é e-mail, status, papéis e
 * data. Por isso as telas identificam pessoas pelo e-mail — inventar um nome a partir dele
 * seria adivinhação exibida como fato.
 */
export function userInitials(email: string): string {
  const [local = ""] = email.split("@");
  const parts = local.split(/[._-]+/).filter((part) => part.length > 0);

  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return local.slice(0, 2).toUpperCase();
}
