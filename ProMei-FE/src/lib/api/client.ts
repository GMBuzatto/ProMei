import { env } from "@/lib/env";
import {
  ApiError,
  abortedError,
  isApiErrorBody,
  networkError,
  timeoutError,
  NO_HTTP_STATUS,
} from "./api-error";
import { ClientErrorCode } from "./business-error-code";
import { CORRELATION_ID_HEADER, generateCorrelationId } from "./correlation-id";
import {
  clearSession,
  expireSession,
  getAccessToken,
  getRefreshToken,
  setSession,
  type Session,
} from "./session-store";

export type QueryValue = string | number | boolean | null | undefined;

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serializado como JSON. Use `FormData` para upload (o browser define o Content-Type). */
  body?: unknown;
  /** Chaves com `undefined`/`null` são omitidas da query string. */
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** `false` para rotas públicas (login, refresh): não manda Authorization nem tenta refresh. */
  auth?: boolean;
  /** Sobrescreve `NEXT_PUBLIC_API_TIMEOUT_MS` (ex.: upload/relatório demorado). */
  timeoutMs?: number;
  /**
   * Como ler a resposta de **sucesso**. `"blob"` para binário (PDF do comprovante): lido como
   * texto, o arquivo chega corrompido.
   *
   * Só afeta o caminho feliz — erro continua sendo lido como JSON e virando `ApiError`, senão
   * um 403 no download voltaria como um "PDF" de mentira.
   */
  responseType?: "json" | "blob";
};

const REFRESH_PATH = "/auth/refresh";

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const base = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${suffix}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/** Junta o signal do chamador (React Query, navegação) com o timeout da requisição. */
function buildSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;
  return AbortSignal.any([external, timeout]);
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return text.length > 0 ? text : undefined;
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Converte a resposta de erro no `ApiError` padrão, preservando o `code` de negócio.
 * Se o corpo não seguir o envelope (proxy, gateway, HTML), cai em `RESPOSTA_INVALIDA`
 * mas ainda carrega o correlation id do header — que é o que permite achar o log.
 */
function toApiError(response: Response, body: unknown, correlationId: string): ApiError {
  const headerCorrelationId = response.headers.get(CORRELATION_ID_HEADER) ?? correlationId;

  if (isApiErrorBody(body)) {
    return new ApiError({
      statusCode: body.statusCode ?? response.status,
      code: body.code,
      message: body.message,
      correlationId: body.correlationId ?? headerCorrelationId,
      raw: body,
    });
  }

  return new ApiError({
    statusCode: response.status,
    code: ClientErrorCode.RESPOSTA_INVALIDA,
    message: `A API respondeu ${response.status} em um formato inesperado.`,
    correlationId: headerCorrelationId,
    raw: body,
  });
}

/**
 * Uma renovação por vez. Sem isso, cinco queries em paralelo tomando 401 disparariam cinco
 * refreshes — e como o refresh token é rotacionado no servidor, os quatro perdedores
 * usariam um token já invalidado e derrubariam a sessão de um usuário legítimo.
 */
let refreshInFlight: Promise<void> | null = null;

async function requestNewSession(refreshToken: string): Promise<Session> {
  const session = await rawRequest<Session>(REFRESH_PATH, {
    method: "POST",
    body: { refreshToken },
    auth: false,
  });

  if (!session?.accessToken || !session?.refreshToken) {
    throw new ApiError({
      statusCode: NO_HTTP_STATUS,
      code: ClientErrorCode.RESPOSTA_INVALIDA,
      message: "A API não devolveu os tokens esperados na renovação de sessão.",
      raw: session,
    });
  }

  return session;
}

/**
 * Renova a sessão. Falha derruba a sessão inteira (evento `promei:session-expired`),
 * porque um refresh recusado significa token revogado, expirado ou reusado.
 */
export function refreshSession(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      expireSession();
      throw new ApiError({
        statusCode: 401,
        code: "NAO_AUTENTICADO",
        message: "Sua sessão expirou. Entre novamente.",
      });
    }

    try {
      setSession(await requestNewSession(refreshToken));
    } catch (error) {
      expireSession();
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/** Uma volta só: monta headers, dispara o fetch e traduz o resultado. Não conhece refresh. */
async function rawRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  const {
    method = "GET",
    body,
    query,
    headers = {},
    signal,
    auth = true,
    timeoutMs = env.NEXT_PUBLIC_API_TIMEOUT_MS,
    responseType = "json",
  } = options;

  const correlationId = generateCorrelationId();
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    [CORRELATION_ID_HEADER]: correlationId,
    ...headers,
  };

  if (body !== undefined && !isFormData) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const accessToken = getAccessToken();
    if (accessToken) requestHeaders.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal: buildSignal(timeoutMs, signal),
      credentials: "omit",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw timeoutError(timeoutMs, error);
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw abortedError(error);
    }
    throw networkError(error);
  }

  // A resposta só pode ser lida uma vez: por isso o erro é decidido pelo status, e o corpo
  // binário só é consumido no caminho de sucesso.
  if (!response.ok) {
    throw toApiError(response, await readBody(response), correlationId);
  }

  if (responseType === "blob") {
    return (await response.blob()) as T;
  }

  return (await readBody(response)) as T;
}

/**
 * Cliente HTTP da aplicação. Toda chamada à API passa por aqui — nunca `fetch` direto
 * num componente ou hook (docs/08-padroes-de-desenvolvimento.md).
 *
 * Garantias:
 * - `x-correlation-id` em toda requisição, e devolvido no `ApiError` para exibir/logar;
 * - `Authorization: Bearer` automático quando há sessão;
 * - **401 dispara refresh** (uma renovação por vez) e repete a requisição original uma
 *   única vez; se o refresh falhar, a sessão é encerrada e o erro sobe com o `code` da API;
 * - erro sempre vira `ApiError` com `code` de negócio — a UI nunca precisa ler `statusCode`.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { auth = true } = options;

  // Depois de um reload o access token (que vive só em memória) sumiu, mas o refresh
  // continua no storage: renova antes de gastar uma requisição que tomaria 401 na certa.
  if (auth && !getAccessToken() && getRefreshToken()) {
    await refreshSession();
  }

  try {
    return await rawRequest<T>(path, options);
  } catch (error) {
    const shouldRefresh =
      auth && error instanceof ApiError && error.statusCode === 401 && path !== REFRESH_PATH;

    if (!shouldRefresh) throw error;

    await refreshSession(); // falhou? o erro do refresh sobe, já com a sessão encerrada.
    return rawRequest<T>(path, options);
  }
}

export const api = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};

export { clearSession, expireSession, setSession };
