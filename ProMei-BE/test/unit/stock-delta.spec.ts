import { describe, expect, it } from 'vitest';
import { StockMovementType } from '../../src/generated/prisma/client';
import {
  acceptsNegativeQuantity,
  resolveStockDelta,
} from '../../src/modules/inventory/stock-delta';

describe('stock-delta (RF-32, RN-22)', () => {
  describe('resolveStockDelta', () => {
    it('entrada soma ao saldo', () => {
      expect(resolveStockDelta(StockMovementType.IN, 10)).toBe(10);
    });

    it('saída chega positiva e vira negativa — a direção mora no tipo', () => {
      expect(resolveStockDelta(StockMovementType.OUT, 10)).toBe(-10);
    });

    it('ajuste preserva o sinal recebido, para os dois lados', () => {
      expect(resolveStockDelta(StockMovementType.ADJUSTMENT, 5)).toBe(5);
      expect(resolveStockDelta(StockMovementType.ADJUSTMENT, -5)).toBe(-5);
    });

    it('saída de quantidade zero não move o saldo', () => {
      // `-0` e não `0`: negar zero em JS produz zero negativo. Os dois somam
      // igual ao saldo, então a regra está certa — o que muda é a comparação
      // estrita do teste, e vale registrar isso em vez de mascarar com `+`.
      expect(resolveStockDelta(StockMovementType.OUT, 0)).toBe(-0);
      expect(100 + resolveStockDelta(StockMovementType.OUT, 0)).toBe(100);
    });
  });

  describe('acceptsNegativeQuantity', () => {
    it('só o ajuste aceita quantidade negativa', () => {
      expect(acceptsNegativeQuantity(StockMovementType.ADJUSTMENT)).toBe(true);
    });

    it('entrada e saída não aceitam — seriam a mesma operação escrita ao contrário', () => {
      expect(acceptsNegativeQuantity(StockMovementType.IN)).toBe(false);
      expect(acceptsNegativeQuantity(StockMovementType.OUT)).toBe(false);
    });
  });
});
