import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../shared/decorators';
import type { Env } from '../../shared/config';
import { getCorrelationId, type RequestWithContext } from '../../shared/logging/correlation-id';
import { SentryService } from '../../shared/sentry';
import { InjectLatencyDto } from './dto/inject-latency.dto';
import { FaultInjectionGuard } from './fault-injection.guard';

/** Erro proposital do ensaio. Nome proprio para ser filtravel no Sentry. */
export class FaultInjectionError extends Error {
  constructor(correlationId: string) {
    super(`Falha injetada para ensaio de alerta (correlation_id=${correlationId})`);
    this.name = 'FaultInjectionError';
  }
}

/**
 * Rotas de ensaio dos alertas (docs/13, docs/15).
 *
 * Existem para responder "o alerta realmente dispara?" sem esperar um incidente
 * real. Ficam publicas de proposito — a ferramenta que ensaia (curl, k6, o proprio
 * monitor de uptime) nao tem sessao — e sao protegidas pelo FaultInjectionGuard:
 * 404 quando desligadas, 401 sem o segredo, e proibidas em producao ja no boot.
 *
 * O roteiro de uso esta em docs/13-observabilidade.md.
 */
@Public()
@UseGuards(FaultInjectionGuard)
@Controller('observability')
export class ObservabilityController {
  constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly sentryService: SentryService,
  ) {}

  /**
   * Gera um 5xx de verdade: passa pelo AllExceptionsFilter, entra no log como
   * error e sobe ao Sentry. Alimenta o alerta de taxa de 5xx e o de erro novo.
   */
  @Post('fault/error')
  injectError(@Req() request: RequestWithContext): never {
    throw new FaultInjectionError(getCorrelationId(request));
  }

  /**
   * Gera um 503 — o mesmo status que o provedor usa para tirar a replica de
   * rotacao. Alimenta o alerta de uptime sem precisar derrubar o container.
   */
  @Post('fault/unavailable')
  injectUnavailable(): never {
    throw new ServiceUnavailableException('Indisponibilidade injetada para ensaio de alerta');
  }

  /**
   * Segura a resposta para empurrar o p95 acima do limite e provar o alerta de
   * latencia. O atraso e limitado por FAULT_INJECTION_MAX_DELAY_MS.
   */
  @Post('fault/latency')
  @HttpCode(HttpStatus.OK)
  async injectLatency(
    @Body() dto: InjectLatencyDto,
    @Req() request: RequestWithContext,
  ): Promise<{ requestedMs: number; appliedMs: number; correlationId: string }> {
    const maxDelayMs = Number(
      this.configService.get('FAULT_INJECTION_MAX_DELAY_MS', { infer: true }),
    );
    const requestedMs = dto.delayMs ?? maxDelayMs;
    const appliedMs = Math.min(requestedMs, maxDelayMs);

    await new Promise((resolve) => setTimeout(resolve, appliedMs));

    return { requestedMs, appliedMs, correlationId: getCorrelationId(request) };
  }

  /**
   * Prova que o projeto recebe eventos (checklist do docs/15) sem quebrar nada:
   * manda uma mensagem e espera o envio, devolvendo o id para conferir no painel.
   */
  @Post('sentry-check')
  @HttpCode(HttpStatus.OK)
  async sentryCheck(@Req() request: RequestWithContext): Promise<{
    enabled: boolean;
    environment?: string;
    eventId?: string;
    flushed?: boolean;
    correlationId: string;
  }> {
    const correlationId = getCorrelationId(request);

    if (!this.sentryService.enabled) {
      return { enabled: false, correlationId };
    }

    const eventId = this.sentryService.captureMessage(
      `Smoke test de observabilidade (correlation_id=${correlationId})`,
      correlationId,
    );
    const flushed = await this.sentryService.flush();

    return {
      enabled: true,
      environment: this.sentryService.environment,
      eventId,
      flushed,
      correlationId,
    };
  }
}
