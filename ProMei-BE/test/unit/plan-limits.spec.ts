import { describe, expect, it } from 'vitest';
import {
  exceedsLimit,
  parsePlanLimits,
  resolveMaxCustomers,
} from '../../src/modules/users/plan-limits';

describe('limites do plan (RN-14)', () => {
  describe('parsePlanLimits', () => {
    it('lê maxUsers, maxItems e maxCustomers do JSON', () => {
      expect(parsePlanLimits({ maxUsers: 3, maxItems: 100, maxCustomers: 50 })).toEqual({
        maxUsers: 3,
        maxItems: 100,
        maxCustomers: 50,
      });
    });

    it('ignora campos com tipo errado em vez de quebrar', () => {
      expect(parsePlanLimits({ maxUsers: 'três' })).toEqual({});
      expect(parsePlanLimits({ maxCustomers: 'cinquenta' })).toEqual({});
    });

    it('tolera JSON ausente ou malformado', () => {
      expect(parsePlanLimits(null)).toEqual({});
      expect(parsePlanLimits([])).toEqual({});
      expect(parsePlanLimits('texto')).toEqual({});
    });
  });

  describe('resolveMaxCustomers (PD-08)', () => {
    it('usa maxCustomers do plano quando declarado', () => {
      expect(resolveMaxCustomers({ maxCustomers: 50 }, 100)).toBe(50);
    });

    it('cai no default de env quando o plano NÃO declara — nunca "sem teto"', () => {
      expect(resolveMaxCustomers({}, 100)).toBe(100);
    });
  });

  describe('exceedsLimit', () => {
    it('plan sem o limite declarado significa sem teto, não zero', () => {
      expect(exceedsLimit(999, undefined)).toBe(false);
    });

    it('bloqueia ao atingir o limite', () => {
      expect(exceedsLimit(3, 3)).toBe(true);
    });

    it('permite enquanto houver vaga', () => {
      expect(exceedsLimit(2, 3)).toBe(false);
    });

    it('bloqueia quando já passou do limite (RN-14: não apaga, só barra novos)', () => {
      expect(exceedsLimit(5, 3)).toBe(true);
    });
  });
});
