import { HttpStatus, Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { BusinessErrorCode, BusinessException } from '../errors';

/**
 * Rate limit real em dev/staging/produção. Desativado em NODE_ENV=test para não
 * quebrar testes de integração que disparam várias tentativas de login de propósito
 * (ex.: fluxo de bloqueio de conta).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(process.env.NODE_ENV === 'test');
  }

  /**
   * A `ThrottlerException` padrão não é `BusinessException`: chegava ao filtro sem `code`,
   * caía no default e virava `ERRO_INTERNO` para o cliente — que exibia "erro do nosso lado"
   * e convidava a tentar de novo, justamente o que renova a janela do bloqueio.
   *
   * Aqui ela passa a ser um erro de negócio como qualquer outro, com o código
   * `LIMITE_DE_REQUISICOES`. O tempo de espera vai na mensagem porque só o servidor sabe
   * quanto falta.
   */
  protected override throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const segundos = Math.max(1, Math.ceil(throttlerLimitDetail.timeToBlockExpire));

    throw new BusinessException(
      BusinessErrorCode.LIMITE_DE_REQUISICOES,
      `Muitas requisições em pouco tempo. Aguarde ${segundos}s e tente de novo.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
