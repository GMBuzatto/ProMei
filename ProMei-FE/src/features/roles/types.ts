/**
 * Espelho dos tipos de papéis por empresa (ProMei-BE, módulo `roles` — RF-12).
 *
 * Rota de tenant: o Admin gerencia os papéis da própria empresa (RN-02) e usuário de
 * plataforma recebe 404.
 */

/** Nome do papel que a RN-04 protege. Igual ao `ADMIN_ROLE` da API. */
export const ADMIN_ROLE = "Admin";

export type Role = {
  id: string;
  name: string;
  /** Papel criado junto da empresa (Admin, Colaborador). A API recusa excluí-lo. */
  isSystem: boolean;
  /** Permissões no formato `recurso:ação`. */
  permissions: string[];
  usersCount?: number;
};
