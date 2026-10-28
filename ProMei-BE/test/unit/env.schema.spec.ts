import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../src/shared/config/env.schema';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
  JWT_ACCESS_SECRET: 'segredo-de-acesso-longo',
  JWT_REFRESH_SECRET: 'segredo-de-refresh-longo',
};

describe('validateEnv', () => {
  it('aplica defaults e converte CORS_ORIGINS em lista', () => {
    const env = validateEnv({ ...validEnv, CORS_ORIGINS: 'http://a.com, http://b.com' });

    expect(env.PORT).toBe(3001);
    expect(env.API_PREFIX).toBe('/api/v1');
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('falha quando um segredo obrigatório está ausente', () => {
    expect(() => validateEnv({ ...validEnv, JWT_ACCESS_SECRET: undefined })).toThrow(
      /ZOD VALIDATION FAILED/,
    );
  });

  describe('injeção de falha (docs/13) — trava de boot', () => {
    const TOKEN = 'token-de-ensaio-com-16+';

    it('não liga por engano com a string "false"', () => {
      const env = validateEnv({ ...validEnv, FAULT_INJECTION_ENABLED: 'false' });

      expect(env.FAULT_INJECTION_ENABLED).toBe(false);
    });

    it('fica desligada por padrão', () => {
      const env = validateEnv(validEnv);

      expect(env.FAULT_INJECTION_ENABLED).toBe(false);
    });

    it('aceita ligada em staging, com token', () => {
      const env = validateEnv({
        ...validEnv,
        SENTRY_ENVIRONMENT: 'staging',
        FAULT_INJECTION_ENABLED: 'true',
        FAULT_INJECTION_TOKEN: TOKEN,
      });

      expect(env.FAULT_INJECTION_ENABLED).toBe(true);
    });

    it('recusa subir ligada em produção', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          NODE_ENV: 'production',
          FAULT_INJECTION_ENABLED: 'true',
          FAULT_INJECTION_TOKEN: TOKEN,
        }),
      ).toThrow(/proibido em producao/);
    });

    it('recusa subir ligada com SENTRY_ENVIRONMENT=production', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          SENTRY_ENVIRONMENT: 'production',
          FAULT_INJECTION_ENABLED: 'true',
          FAULT_INJECTION_TOKEN: TOKEN,
        }),
      ).toThrow(/proibido em producao/);
    });

    it('recusa subir ligada sem token', () => {
      expect(() => validateEnv({ ...validEnv, FAULT_INJECTION_ENABLED: 'true' })).toThrow(
        /FAULT_INJECTION_TOKEN/,
      );
    });

    it('recusa token curto demais para ser segredo', () => {
      expect(() =>
        validateEnv({
          ...validEnv,
          FAULT_INJECTION_ENABLED: 'true',
          FAULT_INJECTION_TOKEN: 'curto',
        }),
      ).toThrow(/FAULT_INJECTION_TOKEN/);
    });
  });
});
