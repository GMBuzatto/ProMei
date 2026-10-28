import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CorrelationIdInterceptor } from '../../src/shared/interceptors';
import { readCorrelationIdHeader, getCorrelationId } from '../../src/shared/logging';

describe('correlation id', () => {
  describe('readCorrelationIdHeader', () => {
    it('le o header quando presente', () => {
      expect(readCorrelationIdHeader({ 'x-correlation-id': 'abc' })).toBe('abc');
    });

    it('usa o primeiro value quando o header vem repetido', () => {
      expect(readCorrelationIdHeader({ 'x-correlation-id': ['abc', 'def'] })).toBe('abc');
    });

    it('retorna undefined quando ausente', () => {
      expect(readCorrelationIdHeader({})).toBeUndefined();
    });
  });

  describe('getCorrelationId', () => {
    it('le de request.id, a fonte unica gerada pelo pino', () => {
      expect(getCorrelationId({ id: 'req-123' })).toBe('req-123');
    });

    it('retorna string vazia quando request.id nao e string', () => {
      expect(getCorrelationId({ id: 42 })).toBe('');
    });
  });

  describe('CorrelationIdInterceptor', () => {
    it('espelha o mesmo id do log no header da response, sem gerar outro', async () => {
      const header = vi.fn();
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ id: 'req-123' }),
          getResponse: () => ({ header }),
        }),
      } as unknown as ExecutionContext;
      const next = { handle: () => of('ok') } as CallHandler;

      await new Promise((resolve) =>
        new CorrelationIdInterceptor().intercept(context, next).subscribe(resolve),
      );

      expect(header).toHaveBeenCalledWith('x-correlation-id', 'req-123');
    });
  });
});
