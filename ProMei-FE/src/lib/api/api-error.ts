import { ClientErrorCode, type BusinessErrorCodeValue } from "./business-error-code";

/**
 * Envelope de erro padrão da API (docs/08-padroes-de-desenvolvimento.md):
 * `{ statusCode, code, message, correlationId }`.
 */
export type ApiErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
};

/** Type guard tolerante: aceita a resposta só se ela tiver a forma do envelope. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return typeof body.code === "string" && typeof body.message === "string";
}

/**
 * Erro único da camada de API. Sempre carrega um `code` — de negócio quando veio da API,
 * de cliente (`FALHA_DE_REDE`, `TIMEOUT`...) quando a requisição nem chegou lá.
 *
 * A UI nunca deve inventar mensagem a partir do `statusCode`: o `code` é o contrato.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: BusinessErrorCodeValue;
  readonly correlationId?: string;
  /** Body cru, quando a resposta não seguia o envelope — útil para log/Sentry. */
  readonly raw?: unknown;

  constructor(params: {
    statusCode: number;
    code: BusinessErrorCodeValue;
    message: string;
    correlationId?: string;
    raw?: unknown;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "ApiError";
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.correlationId = params.correlationId;
    this.raw = params.raw;
  }

  /** `true` quando a sessão expirou/foi invalidada e nem o refresh resolveu. */
  get isUnauthenticated(): boolean {
    return this.statusCode === 401;
  }

  /** `true` para erros em que repetir a requisição não muda nada (4xx exceto 408/429). */
  get isClientFault(): boolean {
    return (
      this.statusCode >= 400 &&
      this.statusCode < 500 &&
      this.statusCode !== 408 &&
      this.statusCode !== 429
    );
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** `0` = a requisição não chegou a receber resposta HTTP. */
export const NO_HTTP_STATUS = 0;

export function networkError(cause: unknown): ApiError {
  return new ApiError({
    statusCode: NO_HTTP_STATUS,
    code: ClientErrorCode.FALHA_DE_REDE,
    message: "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.",
    cause,
  });
}

export function timeoutError(timeoutMs: number, cause?: unknown): ApiError {
  return new ApiError({
    statusCode: NO_HTTP_STATUS,
    code: ClientErrorCode.TIMEOUT,
    message: `O servidor demorou mais de ${Math.round(timeoutMs / 1000)}s para responder.`,
    cause,
  });
}

export function abortedError(cause?: unknown): ApiError {
  return new ApiError({
    statusCode: NO_HTTP_STATUS,
    code: ClientErrorCode.REQUISICAO_CANCELADA,
    message: "Requisição cancelada.",
    cause,
  });
}
