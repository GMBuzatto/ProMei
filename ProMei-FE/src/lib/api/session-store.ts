/**
 * Guarda os tokens da sessão no cliente.
 *
 * Decisões (docs/09-seguranca.md):
 * - a API é stateless e espera o JWT no header `Authorization`, não em cookie — logo o
 *   front precisa mesmo segurar o token em algum lugar acessível ao JS;
 * - o **access token** (15 min) fica só em memória: não sobrevive a reload nem a outra aba,
 *   o que reduz a janela de roubo por XSS;
 * - o **refresh token** (7 dias, rotacionado e revogável no servidor) vai para o
 *   `localStorage`, senão toda recarga de página exigiria login de novo. É o ponto fraco
 *   conhecido do modelo; o mitigador é a rotação + revogação no lado da API.
 *
 * Migrar para cookie `httpOnly` + SameSite exige mudança na API (docs/09 §CSRF) — quando
 * isso acontecer, este é o único arquivo do front que muda.
 */
const REFRESH_TOKEN_STORAGE_KEY = "promei.refresh-token";

/** Disparado quando a sessão cai de vez (refresh inválido/expirado). */
export const SESSION_EXPIRED_EVENT = "promei:session-expired";

/**
 * Disparado sempre que os tokens mudam — login, renovação e logout.
 *
 * Existe porque o access token vive numa variável de módulo: quem depende das claims dele
 * (o `UserProvider`, que lê papéis e permissões) não tem como perceber sozinho que ele
 * apareceu ou sumiu. Sem este aviso, um login feito depois da montagem do provider deixaria
 * a aplicação achando que ninguém está autenticado até um reload.
 */
export const SESSION_CHANGED_EVENT = "promei:session-changed";

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Segundos de validade do access token, como devolvido pela API. */
  expiresIn: number;
};

let accessToken: string | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // localStorage bloqueado (modo privado/3rd-party): trata como sem sessão.
    return null;
  }
}

function notifySessionChanged(): void {
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
  }
}

export function setSession(session: Session): void {
  accessToken = session.accessToken;
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, session.refreshToken);
  } catch {
    // Sem persistência: a sessão vale só até o reload.
  }
  notifySessionChanged();
}

export function clearSession(): void {
  accessToken = null;
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // Nada a fazer — o access token em memória já foi limpo.
  }
  notifySessionChanged();
}

/** Limpa a sessão e avisa a aplicação (redirect para /login, limpar cache do Query...). */
export function expireSession(): void {
  clearSession();
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

export function hasSession(): boolean {
  return accessToken !== null || getRefreshToken() !== null;
}
