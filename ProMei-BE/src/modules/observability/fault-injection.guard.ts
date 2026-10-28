import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config';
import type { RequestWithContext } from '../../shared/logging/correlation-id';

export const FAULT_TOKEN_HEADER = 'x-fault-token';

/**
 * Protege as rotas de injecao de falha, que existem para ensaiar os alertas em
 * staging (docs/13, docs/15) e por definicao produzem 5xx de verdade.
 *
 * Duas travas, nesta ordem:
 * 1. desligada (`FAULT_INJECTION_ENABLED=false`) o endpoint responde 404 — quem
 *    sonda a API nem descobre que ele existe;
 * 2. ligada, exige o segredo em `x-fault-token`.
 *
 * A terceira trava esta no boot: `validateEnv` recusa subir com a flag ligada em
 * producao, entao nao existe combinacao de headers que gere falha la.
 */
@Injectable()
export class FaultInjectionGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    // O Env e gerado dinamicamente do .env.example, entao o ConfigService devolve
    // `any` — tipar como unknown aqui forca a checagem explicita logo abaixo.
    const enabled: unknown = this.configService.get('FAULT_INJECTION_ENABLED', { infer: true });

    if (enabled !== true) {
      throw new NotFoundException('Cannot find route');
    }

    const expected = this.configService.get<string>('FAULT_INJECTION_TOKEN');
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const received = request.headers?.[FAULT_TOKEN_HEADER];

    if (typeof expected !== 'string' || expected.length === 0) {
      throw new NotFoundException('Cannot find route');
    }

    if (typeof received !== 'string' || !equalsInConstantTime(received, expected)) {
      throw new UnauthorizedException('Token de injecao de falha invalido');
    }

    return true;
  }
}

/**
 * Comparacao de tempo constante. `===` em segredo vaza o tamanho do prefixo
 * correto pelo tempo de resposta; `timingSafeEqual` exige buffers do mesmo
 * tamanho, entao o tamanho e conferido antes — e ai o vazamento e so do
 * comprimento, que nao ajuda a adivinhar o valor.
 */
function equalsInConstantTime(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (receivedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}
