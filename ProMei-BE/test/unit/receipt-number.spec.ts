import { describe, expect, it } from 'vitest';
import {
  RECEIPT_NO_FISCAL_VALUE_NOTICE,
  formatReceiptNumber,
} from '../../src/modules/receipts/receipt-number';

describe('receipt-number (RN-24)', () => {
  describe('formatReceiptNumber', () => {
    it('aplica o zero-padding do sequencial', () => {
      expect(formatReceiptNumber(123, 6)).toBe('000123');
      expect(formatReceiptNumber(1, 6)).toBe('000001');
    });

    it('aceita bigint — é o tipo que vem do banco', () => {
      expect(formatReceiptNumber(42n, 6)).toBe('000042');
    });

    it('não trunca sequencial maior que o padding: o valor vale mais que o alinhamento', () => {
      expect(formatReceiptNumber(1_234_567, 6)).toBe('1234567');
    });

    it('respeita padding vindo de config, sem valor fixo no código', () => {
      expect(formatReceiptNumber(7, 3)).toBe('007');
      expect(formatReceiptNumber(7, 10)).toBe('0000000007');
    });
  });

  describe('RECEIPT_NO_FISCAL_VALUE_NOTICE', () => {
    it('é constante de código, não configuração de ambiente', () => {
      // Se virasse variável de ambiente, daria para subir uma instância sem o
      // aviso — e o comprovante passaria a parecer documento fiscal (RN-24).
      expect(RECEIPT_NO_FISCAL_VALUE_NOTICE).toBe('Documento sem valor fiscal');
    });
  });
});
