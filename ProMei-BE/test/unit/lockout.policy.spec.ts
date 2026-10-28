import { describe, expect, it } from 'vitest';
import { calculateLockedUntil, calculateLockoutDurationMs } from '../../src/modules/auth/lockout';

const options = { baseDurationMs: 15 * 60 * 1000, maxDurationMs: 60 * 60 * 1000 };

describe('lockout progressivo (RF-03 / docs-09)', () => {
  it('usa a duração base no primeiro bloqueio', () => {
    expect(calculateLockoutDurationMs(0, options)).toBe(15 * 60 * 1000);
  });

  it('dobra a cada reincidência', () => {
    expect(calculateLockoutDurationMs(1, options)).toBe(30 * 60 * 1000);
    expect(calculateLockoutDurationMs(2, options)).toBe(60 * 60 * 1000);
  });

  it('respeita o teto configurado', () => {
    expect(calculateLockoutDurationMs(3, options)).toBe(options.maxDurationMs);
    expect(calculateLockoutDurationMs(10, options)).toBe(options.maxDurationMs);
  });

  it('não estoura para Infinity com contador absurdo', () => {
    expect(calculateLockoutDurationMs(5000, options)).toBe(options.maxDurationMs);
  });

  it('trata contador negativo como primeiro bloqueio', () => {
    expect(calculateLockoutDurationMs(-3, options)).toBe(options.baseDurationMs);
  });

  it('calcula lockedUntil a partir de agora', () => {
    const now = new Date('2026-01-01T10:00:00.000Z');
    expect(calculateLockedUntil(1, options, now).toISOString()).toBe('2026-01-01T10:30:00.000Z');
  });
});
