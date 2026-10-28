import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Observable } from 'rxjs';
import {
  CORRELATION_ID_HEADER,
  getCorrelationId,
  type RequestWithContext,
} from '../logging/correlation-id';

/**
 * Devolve ao cliente o mesmo correlation id que vai para os logs.
 * O id NAO e gerado aqui: quem gera e o `genReqId` do pino-http, que roda antes
 * de qualquer handler. Gerar em dois lugares faria o log e a resposta divergirem.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const reply = http.getResponse<FastifyReply>();

    const correlationId = getCorrelationId(request);
    if (correlationId) {
      void reply.header(CORRELATION_ID_HEADER, correlationId);
    }

    return next.handle();
  }
}
