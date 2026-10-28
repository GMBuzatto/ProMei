import { describe, expect, it } from 'vitest';
import { buildSentryOptions } from '../../src/shared/sentry/sentry.options';

const DSN = 'https://public@o0.ingest.sentry.io/1';

function env(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: 'development', ...extra };
}

describe('buildSentryOptions', () => {
  it('nao inicializa sem DSN, e sem reclamar fora de producao', () => {
    const { options, warnings } = buildSentryOptions(env());

    expect(options).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('avisa quando o DSN falta em producao', () => {
    const { options, warnings } = buildSentryOptions(env({ NODE_ENV: 'production' }));

    expect(options).toBeNull();
    expect(warnings.join(' ')).toMatch(/SENTRY_DSN ausente em producao/);
  });

  it('nunca liga sendDefaultPii (LGPD, docs/09)', () => {
    const { options } = buildSentryOptions(env({ SENTRY_DSN: DSN }));

    expect(options?.sendDefaultPii).toBe(false);
  });

  describe('environment — e o que separa os alertas de staging dos de producao', () => {
    it('usa SENTRY_ENVIRONMENT quando informado', () => {
      const { options } = buildSentryOptions(
        env({ SENTRY_DSN: DSN, NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging' }),
      );

      expect(options?.environment).toBe('staging');
    });

    it('cai no NODE_ENV quando SENTRY_ENVIRONMENT esta vazio', () => {
      const { options } = buildSentryOptions(
        env({ SENTRY_DSN: DSN, NODE_ENV: 'production', SENTRY_ENVIRONMENT: '' }),
      );

      expect(options?.environment).toBe('production');
    });
  });

  describe('tracesSampleRate — sem ele nao ha p95, logo nao ha alerta de latencia', () => {
    it('assume 0 e avisa que o alerta de latencia fica sem sinal', () => {
      const { options, warnings } = buildSentryOptions(env({ SENTRY_DSN: DSN }));

      expect(options?.tracesSampleRate).toBe(0);
      expect(warnings.join(' ')).toMatch(/p95/);
    });

    it('aceita a taxa configurada, sem avisar', () => {
      const { options, warnings } = buildSentryOptions(
        env({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '1' }),
      );

      expect(options?.tracesSampleRate).toBe(1);
      expect(warnings).toEqual([]);
    });

    it('recusa taxa fora de 0..1 em vez de inicializar errado', () => {
      const { options, warnings } = buildSentryOptions(
        env({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '5' }),
      );

      expect(options).toBeNull();
      expect(warnings.join(' ')).toMatch(/SENTRY_TRACES_SAMPLE_RATE/);
    });
  });

  it('omite release vazio em vez de reportar string vazia', () => {
    const { options } = buildSentryOptions(env({ SENTRY_DSN: DSN, SENTRY_RELEASE: '' }));

    expect(options?.release).toBeUndefined();
  });
});
