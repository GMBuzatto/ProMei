import { randomUUID } from 'node:crypto';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { readCorrelationIdHeader } from '../logging';

/**
 * Fonte única da configuração do FastifyAdapter.
 *
 * Produção e testes de integração precisam do mesmo adapter — em especial do
 * `genReqId`, que é onde o correlation id nasce. Quando o teste montava o
 * adapter por conta própria, o id caía no contador padrão do Fastify
 * (`req-1`, `req-2`...) e o teste deixava de refletir o comportamento real.
 */
export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: true,
    genReqId: (req: { headers: Record<string, unknown> }): string =>
      readCorrelationIdHeader({ ...req.headers }) ?? randomUUID(),
  });
}
