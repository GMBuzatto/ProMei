import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { SentryService } from '../../src/shared/sentry';

async function createService(env: Record<string, string | undefined>): Promise<SentryService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      SentryService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();

  return moduleRef.get(SentryService);
}

describe('SentryService', () => {
  it('fica inativo sem SENTRY_DSN, sem quebrar o boot', async () => {
    const service = await createService({ NODE_ENV: 'development' });

    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.enabled).toBe(false);
  });

  it('avisa quando o DSN falta em producao', async () => {
    const service = await createService({ NODE_ENV: 'production' });
    const warnSpy = vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    service.onModuleInit();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(service.enabled).toBe(false);
  });

  it('ignora capturas enquanto estiver inativo', async () => {
    const service = await createService({ NODE_ENV: 'test' });
    service.onModuleInit();

    expect(() => service.captureException(new Error('x'), { correlationId: 'abc' })).not.toThrow();
  });
});
