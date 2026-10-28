/**
 * Usuário autenticado, lido das claims do access token.
 * Espelho de `AuthenticatedUser` da API (ProMei-BE/src/shared/logging/correlation-id.ts)
 * e do payload montado em `AuthService.issueTokenPair`.
 */
export type AuthenticatedUser = {
  sub: string;
  /** `null` para usuário de plataforma (Super Admin/Staff) — RN-05. */
  company_id: string | null;
  /** Nomes dos papéis, como `Super Admin`, `Admin`, `Colaborador`. */
  roles: string[];
  /** Permissões efetivas no formato `recurso:ação` (ex.: `companies:create`). */
  permissions: string[];
  must_change_password: boolean;
};

/**
 * Payload decodificado do JWT — tudo opcional porque o token vem de fora e nada garante
 * o formato até ser verificado. A assinatura **não** é validada aqui: o front decodifica
 * só para saber o que desenhar; quem valida de verdade é a API.
 */
export type JwtPayload = Partial<AuthenticatedUser>;
