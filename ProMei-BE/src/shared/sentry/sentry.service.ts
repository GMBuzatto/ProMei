import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import type { Env } from '../config';

export interface ErrorContext {
  correlationId: string;
  method?: string;
  url?: string;
  companyId?: string | null;
  userId?: string;
}

/**
 * Envio de erros 5xx ao Sentry (docs/09 e docs/13).
 *
 * O `Sentry.init` NAO acontece aqui — ele roda em `src/instrument.ts`, antes de
 * qualquer outro import, porque a instrumentacao de HTTP precisa vir antes do
 * servidor subir. Este servico observa o cliente ja inicializado e expoe a
 * captura de excecao usada pelo filtro global.
 *
 * Sem `SENTRY_DSN` o servico fica inativo e nao falha — em desenvolvimento o
 * normal e nao ter DSN. Em producao, a ausencia gera aviso no log.
 */
@Injectable()
export class SentryService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(SentryService.name);

  constructor(private readonly configService: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const environment = this.configService.get<string>('NODE_ENV') ?? 'development';

    if (!this.enabled) {
      if (environment === 'production') {
        this.logger.warn('SENTRY_DSN ausente em producao: erros 5xx nao serao reportados.');
      }
      return;
    }

    this.logger.log(`Sentry active (environment=${this.environment ?? environment})`);
  }

  /** Ativo quando `src/instrument.ts` conseguiu inicializar o cliente. */
  get enabled(): boolean {
    return Sentry.getClient() !== undefined;
  }

  /** Environment com que os eventos sao marcados — o mesmo que filtra os alertas. */
  get environment(): string | undefined {
    return Sentry.getClient()?.getOptions().environment;
  }

  /** Envia a exceção com o correlation id como tag, para casar log e evento. */
  captureException(exception: unknown, context: ErrorContext): void {
    if (!this.enabled) return;

    Sentry.withScope((scope) => {
      scope.setTag('correlation_id', context.correlationId);
      if (context.companyId) scope.setTag('company_id', context.companyId);
      if (context.userId) scope.setUser({ id: context.userId });
      scope.setContext('request', {
        method: context.method,
        url: context.url,
        correlation_id: context.correlationId,
      });

      Sentry.captureException(exception);
    });
  }

  /**
   * Envia uma mensagem avulsa e devolve o id do evento. Serve para provar que o
   * projeto esta recebendo eventos (checklist do docs/15) sem precisar quebrar
   * nada de verdade.
   */
  captureMessage(message: string, correlationId: string): string | undefined {
    if (!this.enabled) return undefined;

    return Sentry.withScope((scope) => {
      scope.setTag('correlation_id', correlationId);
      scope.setTag('smoke_test', 'true');
      return Sentry.captureMessage(message, 'info');
    });
  }

  /** Hook do Nest: garante a entrega antes de o processo morrer. */
  async beforeApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  /**
   * Espera o envio dos eventos pendentes. Chamado no shutdown: um container
   * derrubado logo apos o erro levaria o evento embora sem entregar.
   */
  async flush(): Promise<boolean> {
    if (!this.enabled) return true;

    const timeoutMs: unknown = this.configService.get('SENTRY_FLUSH_TIMEOUT_MS', { infer: true });
    return Sentry.flush(Number(timeoutMs));
  }
}
