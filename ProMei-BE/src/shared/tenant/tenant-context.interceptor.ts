import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { runWithTenantContext } from './tenant-context';

/**
 * Abre o contexto de tenant no início de cada requisição.
 *
 * Registrado como middleware (não interceptor) porque precisa envolver TODA a
 * cadeia — inclusive os guards, que é onde o contexto é preenchido.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: FastifyRequest, _res: FastifyReply, next: () => void): void {
    runWithTenantContext({}, next);
  }
}
