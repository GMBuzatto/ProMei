import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { BusinessErrorCode, BusinessException } from '../errors';
import {
  CORRELATION_ID_HEADER,
  getCorrelationId,
  type RequestWithContext,
} from '../logging/correlation-id';
import { SentryService } from '../sentry';

export interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
  /** Campos extras da `BusinessException` (docs/28), ex.: `blocks` em `VENDA_BLOQUEADA`. */
  [key: string]: unknown;
}

const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: BusinessErrorCode.VALIDACAO_FALHOU,
  [HttpStatus.UNAUTHORIZED]: 'NAO_AUTENTICADO',
  [HttpStatus.FORBIDDEN]: BusinessErrorCode.PERMISSAO_NEGADA,
  [HttpStatus.NOT_FOUND]: BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
  [HttpStatus.UNPROCESSABLE_ENTITY]: BusinessErrorCode.VALIDACAO_FALHOU,
  // O AppThrottlerGuard já lança BusinessException com este código; a entrada aqui cobre
  // 429 vindo de outro caminho (ThrottlerException crua, proxy), para que nenhum rate limit
  // volte a se disfarçar de ERRO_INTERNO.
  [HttpStatus.TOO_MANY_REQUESTS]: BusinessErrorCode.LIMITE_DE_REQUISICOES,
};

/** Mensagem devolvida em 5xx. A causa real fica no log, nunca na response. */
const MENSAGEM_ERRO_INTERNO = 'Erro interno do servidor';

/**
 * Converte qualquer exceção no formato padrao da API
 * `{ statusCode, code, message, correlationId }` (docs/08).
 *
 * Garantias:
 * - stack trace e detalhe de SQL nunca chegam na response;
 * - todo 5xx e logado com correlation id e enviado ao Sentry (docs/13);
 * - 4xx de negocio nao vai ao Sentry, porque e esperado.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly sentryService: SentryService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const reply = http.getResponse<FastifyReply>();

    const correlationId = getCorrelationId(request);
    const { statusCode, code, message, extra } = this.describeException(exception);

    if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      const companyId = request.user?.company_id;
      const userId = request.user?.sub;

      this.logger.error(
        {
          correlation_id: correlationId,
          ...(companyId ? { company_id: companyId } : {}),
          ...(userId ? { user_id: userId } : {}),
          method: request.method,
          url: request.url,
          statusCode,
          err: exception,
        },
        'Erro nao tratado na requisicao',
      );

      this.sentryService.captureException(exception, {
        correlationId,
        method: request.method,
        url: request.url,
        companyId,
        userId,
      });
    }

    const body: ErrorResponseBody = { statusCode, code, message, correlationId, ...extra };

    void reply.status(statusCode).header(CORRELATION_ID_HEADER, correlationId).send(body);
  }

  private describeException(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    /** Campos extras do payload (docs/28), ex.: `blocks`, além de `code`/`message`. */
    extra?: Record<string, unknown>;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();

      // 5xx lancado como HttpException tambem tem a mensagem trocada:
      // ela pode conter detalhe interno (driver, SQL, caminho de arquivo).
      if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
        return {
          statusCode,
          code: BusinessErrorCode.ERRO_INTERNO,
          message: MENSAGEM_ERRO_INTERNO,
        };
      }

      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null) {
        const payload = response as Record<string, unknown>;
        const rawMessage = payload['message'];

        return {
          statusCode,
          code:
            typeof payload['code'] === 'string' ? payload['code'] : this.defaultCodeFor(statusCode),
          message: Array.isArray(rawMessage)
            ? rawMessage.join('; ')
            : typeof rawMessage === 'string'
              ? rawMessage
              : exception.message,
          // Só `BusinessException` carrega campos extras (docs/28, ex.:
          // `blocks`) — nunca o `error` que o Nest embute em exceções
          // genéricas (ex.: `BadRequestException` do ValidationPipe).
          ...(exception instanceof BusinessException && exception.extra
            ? { extra: exception.extra }
            : {}),
        };
      }

      return { statusCode, code: this.defaultCodeFor(statusCode), message: String(response) };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: BusinessErrorCode.ERRO_INTERNO,
      message: MENSAGEM_ERRO_INTERNO,
    };
  }

  private defaultCodeFor(statusCode: number): string {
    return DEFAULT_CODE_BY_STATUS[statusCode] ?? BusinessErrorCode.ERRO_INTERNO;
  }
}
