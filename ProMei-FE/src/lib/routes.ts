/**
 * Rotas fixas do front.
 *
 * O caminho do login aparece em três lugares independentes (guard das rotas privadas,
 * queda de sessão no `QueryProvider` e logout) — centralizar evita que um typo em um
 * deles vire 404 silencioso.
 */

/** Rota pública de autenticação. */
export const LOGIN_ROUTE = "/login";

/** Destino padrão de quem entra sem ter pedido nenhuma tela específica. */
export const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard";

/**
 * Troca de senha obrigatória (RF-04).
 *
 * Enquanto `must_change_password` estiver no token, o `PasswordChangeRequiredGuard` da API
 * responde 403 `TROCA_DE_SENHA_OBRIGATORIA` em **todas** as rotas exceto esta — mandar o
 * usuário para qualquer outro lugar entrega um painel que só sabe dar erro.
 */
export const CHANGE_PASSWORD_ROUTE = "/change-password";

/** Parâmetro que carrega o destino pretendido até o login e de volta. */
export const REDIRECT_PARAM = "next";
