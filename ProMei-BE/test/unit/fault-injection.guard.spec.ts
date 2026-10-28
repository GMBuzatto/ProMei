import { type ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import {
  FAULT_TOKEN_HEADER,
  FaultInjectionGuard,
} from '../../src/modules/observability/fault-injection.guard';

const TOKEN = 'token-de-ensaio-com-16+';

function createGuard(env: Record<string, unknown>): FaultInjectionGuard {
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService<never, true>;

  return new FaultInjectionGuard(configService);
}

function createContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('FaultInjectionGuard', () => {
  describe('desligada', () => {
    it('responde 404 — nao revela que a rota existe', () => {
      const guard = createGuard({ FAULT_INJECTION_ENABLED: false, FAULT_INJECTION_TOKEN: TOKEN });

      expect(() => guard.canActivate(createContext({ [FAULT_TOKEN_HEADER]: TOKEN }))).toThrow(
        NotFoundException,
      );
    });

    it('404 mesmo com o token certo, porque a flag manda', () => {
      const guard = createGuard({
        FAULT_INJECTION_ENABLED: undefined,
        FAULT_INJECTION_TOKEN: TOKEN,
      });

      expect(() => guard.canActivate(createContext({ [FAULT_TOKEN_HEADER]: TOKEN }))).toThrow(
        NotFoundException,
      );
    });

    it('nao aceita a string "false" como se fosse ligada', () => {
      const guard = createGuard({
        FAULT_INJECTION_ENABLED: 'false',
        FAULT_INJECTION_TOKEN: TOKEN,
      });

      expect(() => guard.canActivate(createContext({ [FAULT_TOKEN_HEADER]: TOKEN }))).toThrow(
        NotFoundException,
      );
    });
  });

  describe('ligada', () => {
    const turnedOn = { FAULT_INJECTION_ENABLED: true, FAULT_INJECTION_TOKEN: TOKEN };

    it('libera com o token correto', () => {
      const guard = createGuard(turnedOn);

      expect(guard.canActivate(createContext({ [FAULT_TOKEN_HEADER]: TOKEN }))).toBe(true);
    });

    it('recusa sem o header', () => {
      const guard = createGuard(turnedOn);

      expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
    });

    it('recusa token errado do mesmo tamanho', () => {
      const guard = createGuard(turnedOn);
      const wrong = 'x'.repeat(TOKEN.length);

      expect(() => guard.canActivate(createContext({ [FAULT_TOKEN_HEADER]: wrong }))).toThrow(
        UnauthorizedException,
      );
    });

    it('recusa prefixo correto — comparacao nao para no primeiro byte igual', () => {
      const guard = createGuard(turnedOn);

      expect(() =>
        guard.canActivate(createContext({ [FAULT_TOKEN_HEADER]: TOKEN.slice(0, -1) })),
      ).toThrow(UnauthorizedException);
    });

    it('responde 404 se o token nao estiver configurado', () => {
      const guard = createGuard({ FAULT_INJECTION_ENABLED: true, FAULT_INJECTION_TOKEN: '' });

      expect(() => guard.canActivate(createContext({ [FAULT_TOKEN_HEADER]: TOKEN }))).toThrow(
        NotFoundException,
      );
    });
  });
});
