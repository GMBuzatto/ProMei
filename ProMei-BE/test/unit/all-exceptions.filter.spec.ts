import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessErrorCode, BusinessException } from '../../src/shared/errors';
import {
  AllExceptionsFilter,
  type ErrorResponseBody,
} from '../../src/shared/filters/all-exceptions.filter';
import type { SentryService } from '../../src/shared/sentry';

const CORRELATION_ID = 'corr-id-de-teste';

function createHost(): {
  host: ArgumentsHost;
  sentBody: () => ErrorResponseBody;
  sentStatus: () => number;
  headers: () => Record<string, string>;
} {
  let body: ErrorResponseBody | undefined;
  let status = 0;
  const headers: Record<string, string> = {};

  const reply = {
    status: vi.fn((value: number) => {
      status = value;
      return reply;
    }),
    header: vi.fn((name: string, value: string) => {
      headers[name] = value;
      return reply;
    }),
    send: vi.fn((payload: ErrorResponseBody) => {
      body = payload;
      return reply;
    }),
  };

  const request = { id: CORRELATION_ID, method: 'POST', url: '/api/v1/items', headers: {} };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    sentBody: () => body as ErrorResponseBody,
    sentStatus: () => status,
    headers: () => headers,
  };
}

describe('AllExceptionsFilter', () => {
  let captureException: ReturnType<typeof vi.fn>;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    captureException = vi.fn();
    const sentry = { captureException } as unknown as SentryService;
    filter = new AllExceptionsFilter(sentry);
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('converte BusinessException no formato padrao', () => {
    const { host, sentBody, sentStatus } = createHost();

    filter.catch(
      new BusinessException(BusinessErrorCode.ESTOQUE_INSUFICIENTE, 'Saldo insuficiente'),
      host,
    );

    expect(sentStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(sentBody()).toEqual({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'ESTOQUE_INSUFICIENTE',
      message: 'Saldo insuficiente',
      correlationId: CORRELATION_ID,
    });
  });

  it('usa o codigo de negocio padrao para 404', () => {
    const { host, sentBody } = createHost();

    filter.catch(new HttpException('Cannot GET /x', HttpStatus.NOT_FOUND), host);

    expect(sentBody().code).toBe(BusinessErrorCode.RECURSO_NAO_ENCONTRADO);
  });

  /**
   * Regressao: 429 sem `code` caia no default e virava ERRO_INTERNO. O cliente entao exibia
   * "erro do nosso lado" e convidava a tentar de novo — o oposto do que resolve um bloqueio
   * por excesso de requisicoes.
   */
  it('nao deixa 429 se disfarcar de erro interno', () => {
    const { host, sentBody, sentStatus } = createHost();

    filter.catch(
      new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
      host,
    );

    expect(sentStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(sentBody().code).toBe(BusinessErrorCode.LIMITE_DE_REQUISICOES);
  });

  it('devolve o correlation id no body e no header', () => {
    const { host, sentBody, headers } = createHost();

    filter.catch(new HttpException('nao encontrado', HttpStatus.NOT_FOUND), host);

    expect(sentBody().correlationId).toBe(CORRELATION_ID);
    expect(headers()['x-correlation-id']).toBe(CORRELATION_ID);
  });

  describe('erros 5xx', () => {
    it('nunca vaza stack trace, mensagem interna ou SQL na response', () => {
      const { host, sentBody, sentStatus } = createHost();
      const error = new Error(
        'select * from users where password_hash = $1 falhou em /app/src/db.ts:42',
      );

      filter.catch(error, host);

      const body = sentBody();
      expect(sentStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).toBe('Erro interno do servidor');
      expect(body.code).toBe(BusinessErrorCode.ERRO_INTERNO);
      expect(JSON.stringify(body)).not.toContain('select');
      expect(JSON.stringify(body)).not.toContain('password_hash');
      expect(JSON.stringify(body)).not.toContain('.ts:');
      expect(Object.keys(body).sort()).toEqual(['code', 'correlationId', 'message', 'statusCode']);
    });

    it('tambem mascara a mensagem de HttpException 5xx', () => {
      const { host, sentBody } = createHost();

      filter.catch(
        new HttpException('conexao recusada em 10.0.0.5:5432', HttpStatus.BAD_GATEWAY),
        host,
      );

      expect(sentBody().message).toBe('Erro interno do servidor');
      expect(JSON.stringify(sentBody())).not.toContain('10.0.0.5');
    });

    it('loga com correlation id', () => {
      const { host } = createHost();
      const errorSpy = vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

      filter.catch(new Error('falha qualquer'), host);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [context] = errorSpy.mock.calls[0] as [Record<string, unknown>];
      expect(context.correlation_id).toBe(CORRELATION_ID);
      expect(context.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('envia ao Sentry com o correlation id', () => {
      const { host } = createHost();
      const error = new Error('falha qualquer');

      filter.catch(error, host);

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ correlationId: CORRELATION_ID, url: '/api/v1/items' }),
      );
    });
  });

  describe('erros 4xx', () => {
    it('nao envia ao Sentry nem loga como error', () => {
      const { host } = createHost();
      const errorSpy = vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

      filter.catch(
        new BusinessException(BusinessErrorCode.PERMISSAO_NEGADA, 'sem permissao'),
        host,
      );

      expect(captureException).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
