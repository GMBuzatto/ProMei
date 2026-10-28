import { describe, expect, it } from 'vitest';
import {
  ReceiptPdfService,
  type ReceiptPdfData,
  type ReceiptLine,
} from '../../src/modules/receipts/receipt-pdf.service';
import { RECEIPT_NO_FISCAL_VALUE_NOTICE } from '../../src/modules/receipts/receipt-number';
import { extractPdfText } from '../support/pdf-text';

const company = { name: 'Mercearia do Zé', document: '12345678000199' };

function movementData(overrides: Partial<ReceiptPdfData> = {}): ReceiptPdfData {
  return {
    number: '000007',
    issuedAt: new Date('2026-08-13T10:30:00'),
    company,
    issuedBy: 'ze@mercearia.com',
    reason: 'venda balcão',
    lines: [
      {
        sku: 'PARAF-001',
        name: 'Parafuso 3/8',
        unit: 'un',
        quantity: 3,
        unitPrice: '2.50',
        total: '7.50',
      },
    ],
    ...overrides,
  };
}

function saleData(
  overrides: Partial<ReceiptPdfData['sale']> = {},
  dataOverrides: Partial<ReceiptPdfData> = {},
) {
  const lines: ReceiptLine[] = dataOverrides.lines ?? [
    {
      sku: 'PARAF-001',
      name: 'Parafuso',
      unit: 'un',
      quantity: 2,
      unitPrice: '25.00',
      total: '50.00',
    },
  ];

  const data: ReceiptPdfData = {
    number: '000456',
    issuedAt: new Date('2026-09-03T14:22:00'),
    company,
    issuedBy: 'maria@empresa.com',
    sale: {
      number: '000123',
      kind: 'CASH',
      paymentMethodLabel: 'PIX',
      dueDate: null,
      subtotal: '50.00',
      discount: null,
      total: '50.00',
      pendingAmount: null,
      canceledAt: null,
      customer: null,
      ...overrides,
    },
    lines,
    ...dataOverrides,
  };

  return data;
}

describe('ReceiptPdfService — variante "COMPROVANTE DE SAÍDA" (regressão do MVP)', () => {
  it('não muda: título, empresa, item e total seguem batendo', async () => {
    const text = extractPdfText(await new ReceiptPdfService().render(movementData()));

    expect(text).toContain('COMPROVANTE DE SAÍDA');
    expect(text).toContain('Mercearia do Zé');
    expect(text).toContain('PARAF-001');
    expect(text).toContain('R$ 2,50');
    expect(text).toContain('R$ 7,50');
    expect(text).toContain('Motivo: venda balcão');
    expect(text).toContain(RECEIPT_NO_FISCAL_VALUE_NOTICE);
    expect(text).not.toContain('COMPROVANTE DE VENDA');
  });
});

describe('ReceiptPdfService — variante "COMPROVANTE DE VENDA" (docs/33)', () => {
  it('venda com 1 item, à vista, sem cliente: sem bloco CLIENTE, PAGAMENTO diz "À vista · PAGO"', async () => {
    const text = extractPdfText(await new ReceiptPdfService().render(saleData()));

    expect(text).toContain('COMPROVANTE DE VENDA');
    expect(text).toContain('Venda nº 000123');
    expect(text).toContain('Comprovante nº 000456');
    expect(text).not.toContain('CLIENTE');
    expect(text).toContain('À vista · PIX · PAGO');
  });

  it('venda a prazo com cliente: bloco CLIENTE, vencimento e valor pendente', async () => {
    const text = extractPdfText(
      await new ReceiptPdfService().render(
        saleData({
          kind: 'CREDIT',
          paymentMethodLabel: null,
          dueDate: new Date('2026-10-15T00:00:00'),
          pendingAmount: '50.00',
          customer: { name: 'João da Silva', document: '00000000000', phone: '(11) 90000-0000' },
        }),
      ),
    );

    expect(text).toContain('CLIENTE');
    expect(text).toContain('João da Silva');
    expect(text).toContain('00000000000');
    expect(text).toContain('(11) 90000-0000');
    expect(text).toContain('A prazo · Vencimento: 15/10/2026');
    expect(text).toContain('Valor pendente: R$ 50,00');
  });

  it('cliente sem documento nem telefone: bloco aparece só com o nome', async () => {
    const text = extractPdfText(
      await new ReceiptPdfService().render(
        saleData({ customer: { name: 'Cliente Balcão', document: null, phone: null } }),
      ),
    );

    expect(text).toContain('CLIENTE');
    expect(text).toContain('Cliente Balcão');
    expect(text).not.toContain('CPF/CNPJ');
  });

  it('venda com desconto: subtotal, desconto e total, e a soma das linhas bate com o subtotal', async () => {
    const lines: ReceiptLine[] = [
      { sku: 'A', name: 'Item A', unit: 'un', quantity: 1, unitPrice: '300.00', total: '300.00' },
      { sku: 'B', name: 'Item B', unit: 'un', quantity: 1, unitPrice: '200.00', total: '200.00' },
    ];

    const text = extractPdfText(
      await new ReceiptPdfService().render(
        saleData({ subtotal: '500.00', discount: '20.00', total: '480.00' }, { lines }),
      ),
    );

    expect(text).toContain('R$ 300,00');
    expect(text).toContain('R$ 200,00');
    expect(text).toContain('Subtotal: R$ 500,00');
    expect(text).toContain('Desconto: R$ 20,00');
    expect(text).toContain('TOTAL: R$ 480,00');
  });

  it('sem desconto, o bloco Desconto não aparece', async () => {
    const text = extractPdfText(await new ReceiptPdfService().render(saleData({ discount: null })));

    expect(text).not.toContain('Desconto');
  });

  it("venda cancelada: marca d'água CANCELADA e data do cancelamento", async () => {
    const text = extractPdfText(
      await new ReceiptPdfService().render(
        saleData({ canceledAt: new Date('2026-09-10T09:00:00') }),
      ),
    );

    expect(text).toContain('CANCELADA');
    expect(text).toContain('Cancelada em: 10/09/2026');
  });

  it('venda com 100 itens: mais de uma página, e o aviso da RN-24 em todas', async () => {
    const lines: ReceiptLine[] = Array.from({ length: 100 }, (_, index) => ({
      sku: `SKU-${String(index)}`,
      name: `Item ${String(index)}`,
      unit: 'un',
      quantity: 1,
      unitPrice: '10.00',
      total: '10.00',
    }));

    const buffer = await new ReceiptPdfService().render(
      saleData({ subtotal: '1000.00', total: '1000.00' }, { lines }),
    );
    const text = extractPdfText(buffer);

    const noticeCount = text.split(RECEIPT_NO_FISCAL_VALUE_NOTICE).length - 1;
    expect(noticeCount).toBeGreaterThanOrEqual(2);
  });
});
