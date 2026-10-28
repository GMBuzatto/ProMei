import { describe, expect, it } from 'vitest';
import { createCorsOptions } from '../../src/shared/http';

describe('createCorsOptions', () => {
  it('libera os métodos de escrita usados pelo front-end', () => {
    const options = createCorsOptions(['http://localhost:3000']);

    // Regressão: o default do @fastify/cors é GET,HEAD,POST — sem estes métodos
    // o preflight de PATCH/PUT/DELETE é bloqueado pelo navegador.
    expect(options.methods).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']),
    );
  });

  it('expõe o correlation id e aceita os headers enviados pelo cliente', () => {
    const options = createCorsOptions(['http://localhost:3000']);

    expect(options.exposedHeaders).toContain('x-correlation-id');
    expect(options.allowedHeaders).toEqual(
      expect.arrayContaining(['Authorization', 'Content-Type', 'x-correlation-id']),
    );
  });

  it('não usa credentials: a API é stateless com JWT no header', () => {
    expect(createCorsOptions(['http://localhost:3000']).credentials).toBe(false);
  });

  it('falha no boot quando a allowlist está vazia', () => {
    expect(() => createCorsOptions([])).toThrow(/CORS_ORIGINS/);
  });
});
