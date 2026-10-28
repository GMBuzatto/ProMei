import { describe, expect, it } from 'vitest';
import { Prisma, SaleStatus } from '../../src/generated/prisma/client';
import { decideSaleStatus, type SaleStatusInput } from '../../src/modules/sales/sale-status.policy';

const { Decimal } = Prisma;

const NOW = new Date('2026-09-15T00:00:00.000Z');

function tomorrow(): Date {
  return new Date(NOW.getTime() + 86_400_000);
}

function yesterday(): Date {
  return new Date(NOW.getTime() - 86_400_000);
}

function baseInput(overrides: Partial<SaleStatusInput> = {}): SaleStatusInput {
  return {
    total: new Decimal('100.00'),
    paidAmount: new Decimal('0.00'),
    dueDate: null,
    canceledAt: null,
    now: NOW,
    ...overrides,
  };
}

describe('sale-status.policy (docs/19, RN-40 a RN-47)', () => {
  it('CANCELED vence tudo, mesmo com saldo em aberto e vencida', () => {
    const input = baseInput({ dueDate: yesterday(), canceledAt: yesterday() });
    expect(decideSaleStatus(input)).toBe(SaleStatus.CANCELED);
  });

  it('CANCELED vence tudo, mesmo já quitada', () => {
    const input = baseInput({ paidAmount: new Decimal('100.00'), canceledAt: yesterday() });
    expect(decideSaleStatus(input)).toBe(SaleStatus.CANCELED);
  });

  it('venda à vista nasce PAID (saldo zero, sem vencimento)', () => {
    const input = baseInput({ paidAmount: new Decimal('100.00'), dueDate: null });
    expect(decideSaleStatus(input)).toBe(SaleStatus.PAID);
  });

  it('quitada com atraso ainda é PAID — PAID vence o vencimento', () => {
    const input = baseInput({ paidAmount: new Decimal('100.00'), dueDate: yesterday() });
    expect(decideSaleStatus(input)).toBe(SaleStatus.PAID);
  });

  it('venda a prazo recém-criada, sem pagamento e não vencida → PENDING', () => {
    const input = baseInput({ dueDate: tomorrow() });
    expect(decideSaleStatus(input)).toBe(SaleStatus.PENDING);
  });

  it('vencimento é HOJE → ainda não vencida (limite estrito) → PENDING', () => {
    const input = baseInput({ dueDate: NOW });
    expect(decideSaleStatus(input)).toBe(SaleStatus.PENDING);
  });

  it('pagamento parcial e não vencida → PARTIALLY_PAID', () => {
    const input = baseInput({ paidAmount: new Decimal('40.00'), dueDate: tomorrow() });
    expect(decideSaleStatus(input)).toBe(SaleStatus.PARTIALLY_PAID);
  });

  it('sem pagamento e vencida → OVERDUE', () => {
    const input = baseInput({ dueDate: yesterday() });
    expect(decideSaleStatus(input)).toBe(SaleStatus.OVERDUE);
  });

  it('pagamento parcial e vencida → OVERDUE', () => {
    const input = baseInput({ paidAmount: new Decimal('40.00'), dueDate: yesterday() });
    expect(decideSaleStatus(input)).toBe(SaleStatus.OVERDUE);
  });

  it('saldo negativo (pago a mais) conta como quitada → PAID', () => {
    const input = baseInput({ paidAmount: new Decimal('120.00'), dueDate: yesterday() });
    expect(decideSaleStatus(input)).toBe(SaleStatus.PAID);
  });
});
