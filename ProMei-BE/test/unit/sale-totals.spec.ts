import { describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client';
import {
  calculateBalance,
  calculateItemTotal,
  calculateSaleTotal,
  isDiscountValid,
} from '../../src/modules/sales/sale-totals';

const { Decimal } = Prisma;

describe('sale-totals (docs/19, RN-44)', () => {
  describe('calculateItemTotal', () => {
    it('3 × 0,33 = 0,99', () => {
      expect(calculateItemTotal(new Decimal('0.33'), 3).toFixed(2)).toBe('0.99');
    });

    it("0,125 → 0,13 (round half up, não banker's rounding)", () => {
      expect(calculateItemTotal(new Decimal('0.125'), 1).toFixed(2)).toBe('0.13');
    });

    it('preço com mais de 2 casas intermediárias arredonda só no total do item', () => {
      expect(calculateItemTotal(new Decimal('19.995'), 1).toFixed(2)).toBe('20.00');
    });
  });

  describe('calculateSaleTotal', () => {
    it('soma de 100 itens de 0,01 = 1,00 exato', () => {
      const itemTotals = Array.from({ length: 100 }, () =>
        calculateItemTotal(new Decimal('0.01'), 1),
      );
      expect(calculateSaleTotal(itemTotals, new Decimal(0)).toFixed(2)).toBe('1.00');
    });

    it('soma das linhas já arredondadas bate com o total exibido', () => {
      const itemTotals = [new Decimal('0.33'), new Decimal('0.33'), new Decimal('0.33')];
      expect(calculateSaleTotal(itemTotals, new Decimal(0)).toFixed(2)).toBe('0.99');
    });

    it('aplica o desconto sobre a soma dos itens', () => {
      const itemTotals = [new Decimal('50.00'), new Decimal('30.00')];
      expect(calculateSaleTotal(itemTotals, new Decimal('10.00')).toFixed(2)).toBe('70.00');
    });

    it('sem itens e sem desconto, total é zero', () => {
      expect(calculateSaleTotal([], new Decimal(0)).toFixed(2)).toBe('0.00');
    });
  });

  describe('calculateBalance', () => {
    it('total menos pago', () => {
      expect(calculateBalance(new Decimal('100.00'), new Decimal('40.00')).toFixed(2)).toBe(
        '60.00',
      );
    });

    it('quitada: saldo zero', () => {
      expect(calculateBalance(new Decimal('100.00'), new Decimal('100.00')).toFixed(2)).toBe(
        '0.00',
      );
    });
  });

  describe('isDiscountValid', () => {
    it('desconto menor que o total dos itens é válido', () => {
      expect(isDiscountValid(new Decimal('100.00'), new Decimal('50.00'))).toBe(true);
    });

    it('desconto igual ao total dos itens é inválido', () => {
      expect(isDiscountValid(new Decimal('100.00'), new Decimal('100.00'))).toBe(false);
    });

    it('desconto maior que o total dos itens é inválido', () => {
      expect(isDiscountValid(new Decimal('100.00'), new Decimal('150.00'))).toBe(false);
    });
  });
});
