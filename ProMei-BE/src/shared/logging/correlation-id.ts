import type { FastifyRequest } from 'fastify';

/** Header propagado do web ate a API e devolvido em toda resposta de erro. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Payload do JWT anexado ao request pelo JwtAuthGuard (shared/guards). */
export interface AuthenticatedUser {
  sub?: string;
  company_id?: string | null;
  roles?: string[];
  permissions?: string[]; // ex: ["items:create", "inventory:read"]
  must_change_password?: boolean;
}

export interface RequestWithContext extends FastifyRequest {
  user?: AuthenticatedUser;
}

/**
 * Fonte unica do correlation id: o `genReqId` do pino-http grava em `request.id`
 * antes de qualquer handler. Interceptor e filtro apenas leem daqui, para que o
 * id do log e o id devolvido ao cliente sejam sempre o mesmo value.
 */
export function getCorrelationId(request: { id?: unknown }): string {
  return typeof request.id === 'string' ? request.id : '';
}

export function readCorrelationIdHeader(headers: Record<string, unknown>): string | undefined {
  const raw = headers[CORRELATION_ID_HEADER];
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : undefined;
  return typeof raw === 'string' ? raw : undefined;
}
