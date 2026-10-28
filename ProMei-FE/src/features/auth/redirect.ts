import { DEFAULT_AUTHENTICATED_ROUTE, LOGIN_ROUTE, REDIRECT_PARAM } from "@/lib/routes";

/**
 * Origem descartável usada só para o parser de URL resolver caminhos relativos. Se o valor
 * recebido conseguir escapar dela, é porque não era um caminho interno.
 */
const PARSER_ORIGIN = "http://redirect.invalid";

/**
 * Tab, newline e afins são silenciosamente removidos pelo parser de URL — `/\ttarget` viraria
 * `/target`. Barramos antes para não normalizar entrada suja em rota válida.
 */
function hasControlChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Valida o destino pós-login vindo da query string.
 *
 * A regra é uma só: **só passa caminho interno**. O valor chega pela URL, ou seja, de
 * qualquer um — um `?next=https://evil.com` aceito de olhos fechados transformaria o login
 * num open redirect (docs/09-seguranca.md, "nunca confiar na entrada do front").
 *
 * Casos barrados: URL absoluta (`https://...`), protocol-relative (`//evil.com` e a variante
 * com barra invertida que o browser normaliza para o mesmo), esquemas como `javascript:`,
 * caracteres de controle e o próprio `/login` — este último não é ataque, é laço infinito.
 *
 * @returns o caminho normalizado (path + query + hash) ou `null` se não for confiável.
 */
export function sanitizeRedirectPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || hasControlChars(value)) return null;

  let url: URL;
  try {
    url = new URL(value, PARSER_ORIGIN);
  } catch {
    return null;
  }

  // `//evil.com` e `/\evil.com` resolvem para outra origem — o parser é quem denuncia.
  if (url.origin !== PARSER_ORIGIN) return null;
  if (url.pathname === LOGIN_ROUTE) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Monta o destino do redirect para o login preservando a tela que o usuário tentou abrir,
 * para que o deep link (`/items` colado no browser) sobreviva ao login.
 *
 * Se o destino não passar na sanitização, cai no `/login` seco — nunca propaga o valor cru.
 */
export function buildLoginHref(pathname: string, search = ""): string {
  const target = sanitizeRedirectPath(`${pathname}${search}`);
  if (!target) return LOGIN_ROUTE;

  return `${LOGIN_ROUTE}?${REDIRECT_PARAM}=${encodeURIComponent(target)}`;
}

/** Para onde mandar o usuário depois de autenticar: o destino pedido ou o dashboard. */
export function resolvePostLoginRoute(rawTarget: string | null | undefined): string {
  return sanitizeRedirectPath(rawTarget) ?? DEFAULT_AUTHENTICATED_ROUTE;
}

/**
 * Lê o destino pretendido da query string atual do browser.
 *
 * Usa `window.location` em vez de `useSearchParams()` de propósito: o hook obriga a envolver
 * quem o chama num `<Suspense>` e tira a página do render estático no build. Como as duas
 * leituras acontecem depois da montagem (efeito do guard e callback de sucesso do login), o
 * objeto `location` já existe e a leitura não custa nada.
 */
export function readRequestedRoute(): string {
  if (typeof window === "undefined") return DEFAULT_AUTHENTICATED_ROUTE;

  const requested = new URLSearchParams(window.location.search).get(REDIRECT_PARAM);
  return resolvePostLoginRoute(requested);
}
