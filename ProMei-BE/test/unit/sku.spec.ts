import { describe, expect, it } from 'vitest';
import { buildSku, parseSkuSequence } from '../../src/modules/items/sku';

describe('sku (RN-25)', () => {
  describe('buildSku', () => {
    it('monta o SKU com o sequencial zero-padded', () => {
      expect(buildSku('ITM', 1, 6)).toBe('ITM-000001');
      expect(buildSku('ITM', 4321, 6)).toBe('ITM-004321');
    });

    it('respeita prefixo e padding vindos de config, sem valor fixo', () => {
      expect(buildSku('PROD', 7, 3)).toBe('PROD-007');
    });

    it('não trunca sequencial maior que o padding', () => {
      expect(buildSku('ITM', 1_234_567, 6)).toBe('ITM-1234567');
    });
  });

  describe('parseSkuSequence', () => {
    it('extrai o sequencial de um SKU gerado', () => {
      expect(parseSkuSequence('ITM-000042', 'ITM')).toBe(42);
    });

    it('ignora SKU de outro prefixo', () => {
      expect(parseSkuSequence('PROD-000042', 'ITM')).toBeNull();
    });

    it('ignora SKU informado à mão que não seja numérico', () => {
      expect(parseSkuSequence('ITM-PARAF01', 'ITM')).toBeNull();
      expect(parseSkuSequence('PARAF-001', 'ITM')).toBeNull();
    });

    it('não confunde sufixo vazio ou com espaço com zero', () => {
      expect(parseSkuSequence('ITM-', 'ITM')).toBeNull();
      expect(parseSkuSequence('ITM- 1', 'ITM')).toBeNull();
    });

    it('é a volta de buildSku', () => {
      expect(parseSkuSequence(buildSku('ITM', 99, 6), 'ITM')).toBe(99);
    });
  });
});
