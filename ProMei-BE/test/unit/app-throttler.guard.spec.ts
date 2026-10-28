import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { BusinessErrorCode, BusinessException } from '../../src/shared/errors';
import { AppThrottlerGuard } from '../../src/shared/guards/app-throttler.guard';

/**
 * `throwThrottlingException` e protected: o cast expoe so o metodo sob teste, sem precisar
 * montar o guard inteiro (storage, reflector, opcoes do modulo).
 */
type ThrottlingThrower = {
  throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void>;
};

function invokeThrottling(detail: Partial<ThrottlerLimitDetail>): () => void {
  const guard = Object.create(AppThrottlerGuard.prototype) as ThrottlingThrower;
  const context = {} as ExecutionContext;

  const full: ThrottlerLimitDetail = {
    totalHits: 6,
    timeToExpire: 30,
    isBlocked: true,
    timeToBlockExpire: 42,
    ttl: 60_000,
    limit: 5,
    key: 'chave',
    tracker: '127.0.0.1',
    ...detail,
  };

  return () => {
    void guard.throwThrottlingException(context, full);
  };
}

describe('AppThrottlerGuard', () => {
  /**
   * Sem este override a ThrottlerException chegava ao filtro sem `code`, virava
   * ERRO_INTERNO e o cliente exibia "erro do nosso lado" — sugerindo tentar de novo,
   * que e justamente o que renova a janela do bloqueio.
   */
  it('lanca erro de negocio com LIMITE_DE_REQUISICOES em 429', () => {
    expect(invokeThrottling({})).toThrowError(BusinessException);

    try {
      invokeThrottling({})();
      expect.unreachable('deveria ter lancado');
    } catch (error) {
      const business = error as BusinessException;
      expect(business.code).toBe(BusinessErrorCode.LIMITE_DE_REQUISICOES);
      expect(business.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('informa quantos segundos faltam para liberar', () => {
    expect(invokeThrottling({ timeToBlockExpire: 42 })).toThrowError(/42s/);
  });

  /** Fracao de segundo nao pode virar "aguarde 0s", que soaria como "tente agora". */
  it('arredonda para pelo menos 1s', () => {
    expect(invokeThrottling({ timeToBlockExpire: 0.2 })).toThrowError(/1s/);
  });

  it('e desativado apenas em NODE_ENV=test', async () => {
    const guard = Object.create(AppThrottlerGuard.prototype) as AppThrottlerGuard;
    const shouldSkip = (
      guard as unknown as { shouldSkip: (c: ExecutionContext) => Promise<boolean> }
    ).shouldSkip.bind(guard);

    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'test';
      expect(await shouldSkip({} as ExecutionContext)).toBe(true);

      process.env.NODE_ENV = 'production';
      expect(await shouldSkip({} as ExecutionContext)).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
