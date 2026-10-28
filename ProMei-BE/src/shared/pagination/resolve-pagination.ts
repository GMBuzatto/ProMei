import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config';

export interface ResolvedPagination {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Resolve page/limit de uma listagem a partir do que o cliente pediu, com defaults e
 * teto vindos de PAGINATION_DEFAULT_LIMIT/PAGINATION_MAX_LIMIT (docs/16) — nunca hardcoded.
 */
export function resolvePagination(
  config: ConfigService<Env, true>,
  requestedPage?: number,
  requestedLimit?: number,
): ResolvedPagination {
  const defaultLimit: number = config.get('PAGINATION_DEFAULT_LIMIT', { infer: true });
  const maxLimit: number = config.get('PAGINATION_MAX_LIMIT', { infer: true });

  const page = requestedPage ?? 1;
  const limit = Math.min(requestedLimit ?? defaultLimit, maxLimit);

  return { page, limit, skip: (page - 1) * limit };
}
