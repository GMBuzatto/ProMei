import { describe, expect, it } from 'vitest';
import {
  CustomerFinancialStatus,
  CustomerStatus,
  ItemStatus,
  Prisma,
  SaleBlockReason,
} from '../../src/generated/prisma/client';
import {
  SaleValidationService,
  type CreditCheckInput,
  type LockedSaleItem,
} from '../../src/modules/sales/sale-validation.service';

const { Decimal } = Prisma;

function item(overrides: Partial<LockedSaleItem> = {}): LockedSaleItem {
  return {
    itemId: 'item-1',
    sku: 'PARAF-001',
    status: ItemStatus.ACTIVE,
    stock: 10,
    requestedQuantity: 5,
    ...overrides,
  };
}

function creditInput(overrides: Partial<CreditCheckInput> = {}): CreditCheckInput {
  return {
    customerStatus: CustomerStatus.ACTIVE,
    blockedForCredit: false,
    financialStatus: CustomerFinancialStatus.REGULAR,
    creditLimit: new Decimal('1000.00'),
    usedInPeriod: new Decimal('0.00'),
    saleTotal: new Decimal('300.00'),
    ...overrides,
  };
}

describe('sale-validation.service (docs/19, docs/23, RN-47)', () => {
  const service = new SaleValidationService();

  it('sem impedimento, devolve lista vazia', () => {
    expect(service.collectItemBlocks([item()])).toEqual([]);
  });

  it('estoque insuficiente vira bloqueio INSUFFICIENT_STOCK, não liberável', () => {
    const blocks = service.collectItemBlocks([item({ stock: 3, requestedQuantity: 8 })]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      reason: SaleBlockReason.INSUFFICIENT_STOCK,
      authorizable: false,
    });
    expect(blocks[0]!.details).toMatchObject({
      items: [{ itemId: 'item-1', sku: 'PARAF-001', available: 3, requested: 8 }],
    });
  });

  it('quantidade igual ao saldo não bloqueia — o limite é negativo, não zero', () => {
    expect(service.collectItemBlocks([item({ stock: 5, requestedQuantity: 5 })])).toEqual([]);
  });

  it('item inativo vira bloqueio ITEM_INACTIVE, não liberável', () => {
    const blocks = service.collectItemBlocks([item({ status: ItemStatus.INACTIVE })]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      reason: SaleBlockReason.ITEM_INACTIVE,
      authorizable: false,
    });
  });

  it('todos os itens sem saldo aparecem juntos, não só o primeiro (docs/23)', () => {
    const blocks = service.collectItemBlocks([
      item({ itemId: 'a', sku: 'A', stock: 1, requestedQuantity: 5 }),
      item({ itemId: 'b', sku: 'B', stock: 10, requestedQuantity: 5 }),
      item({ itemId: 'c', sku: 'C', stock: 2, requestedQuantity: 9 }),
    ]);

    expect(blocks).toHaveLength(1);
    const stockBlock = blocks.find((block) => block.reason === SaleBlockReason.INSUFFICIENT_STOCK)!;
    expect((stockBlock.details['items'] as unknown[]).length).toBe(2);
  });

  it('item inativo e estoque insuficiente juntos: dois bloqueios, um pedido (RN-47)', () => {
    const blocks = service.collectItemBlocks([
      item({ itemId: 'a', status: ItemStatus.INACTIVE }),
      item({ itemId: 'b', stock: 1, requestedQuantity: 5 }),
    ]);

    const reasons = blocks.map((block) => block.reason).sort();
    expect(reasons).toEqual(
      [SaleBlockReason.ITEM_INACTIVE, SaleBlockReason.INSUFFICIENT_STOCK].sort(),
    );
  });
});

describe('sale-validation.service — collectCreditBlocks (docs/19, docs/20, docs/21)', () => {
  const service = new SaleValidationService();

  it('cliente regular, dentro do limite: lista vazia', () => {
    expect(service.collectCreditBlocks(creditInput())).toEqual([]);
  });

  it('cliente inativo: CUSTOMER_INACTIVE, não liberável', () => {
    const blocks = service.collectCreditBlocks(
      creditInput({ customerStatus: CustomerStatus.INACTIVE }),
    );

    expect(blocks).toEqual([
      expect.objectContaining({ reason: SaleBlockReason.CUSTOMER_INACTIVE, authorizable: false }),
    ]);
  });

  it('cliente bloqueado manualmente: CUSTOMER_BLOCKED, não liberável', () => {
    const blocks = service.collectCreditBlocks(creditInput({ blockedForCredit: true }));

    expect(blocks).toEqual([
      expect.objectContaining({ reason: SaleBlockReason.CUSTOMER_BLOCKED, authorizable: false }),
    ]);
  });

  it('cliente OVERDUE: OVERDUE_PAYMENT, liberável', () => {
    const blocks = service.collectCreditBlocks(
      creditInput({ financialStatus: CustomerFinancialStatus.OVERDUE }),
    );

    expect(blocks).toEqual([
      expect.objectContaining({ reason: SaleBlockReason.OVERDUE_PAYMENT, authorizable: true }),
    ]);
  });

  it('cliente DELINQUENT: CUSTOMER_DELINQUENT, liberável — nunca os dois juntos com OVERDUE_PAYMENT', () => {
    const blocks = service.collectCreditBlocks(
      creditInput({ financialStatus: CustomerFinancialStatus.DELINQUENT }),
    );

    expect(blocks).toEqual([
      expect.objectContaining({ reason: SaleBlockReason.CUSTOMER_DELINQUENT, authorizable: true }),
    ]);
  });

  it('utilizado + total > limite: INSUFFICIENT_LIMIT, liberável, com details em dot-decimal', () => {
    const blocks = service.collectCreditBlocks(
      creditInput({
        creditLimit: new Decimal('1000.00'),
        usedInPeriod: new Decimal('700.00'),
        saleTotal: new Decimal('500.00'),
      }),
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      reason: SaleBlockReason.INSUFFICIENT_LIMIT,
      authorizable: true,
      message: 'Limite disponível de R$ 300,00 é menor que o total de R$ 500,00.',
      details: {
        creditLimit: '1000.00',
        periodUsed: '700.00',
        available: '300.00',
        saleTotal: '500.00',
      },
    });
  });

  it('utilizado + total == limite exatamente: não bloqueia (a régua é ">", não ">=")', () => {
    const blocks = service.collectCreditBlocks(
      creditInput({
        creditLimit: new Decimal('1000.00'),
        usedInPeriod: new Decimal('700.00'),
        saleTotal: new Decimal('300.00'),
      }),
    );

    expect(blocks).toEqual([]);
  });

  it('vários motivos juntos, um pedido só (RN-47): cliente inadimplente, bloqueado e sem limite', () => {
    const blocks = service.collectCreditBlocks(
      creditInput({
        blockedForCredit: true,
        financialStatus: CustomerFinancialStatus.DELINQUENT,
        creditLimit: new Decimal('100.00'),
        usedInPeriod: new Decimal('50.00'),
        saleTotal: new Decimal('500.00'),
      }),
    );

    const reasons = blocks.map((block) => block.reason).sort();
    expect(reasons).toEqual(
      [
        SaleBlockReason.CUSTOMER_BLOCKED,
        SaleBlockReason.CUSTOMER_DELINQUENT,
        SaleBlockReason.INSUFFICIENT_LIMIT,
      ].sort(),
    );
  });
});
