import { describe, expect, it } from 'vitest';
import { CustomerFinancialStatus } from '../../src/generated/prisma/client';
import {
  decideCustomerFinancialStatus,
  type OpenSaleForStatus,
} from '../../src/modules/customers/customer-status.policy';

const TODAY = new Date('2026-09-15T00:00:00.000Z');
const DELINQUENCY_DAYS = 30;

function daysAgo(days: number): Date {
  return new Date(TODAY.getTime() - days * 86_400_000);
}

describe('customer-status.policy (docs/18, docs/21, docs/30)', () => {
  it('sem venda em aberto → REGULAR', () => {
    expect(decideCustomerFinancialStatus([], TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.REGULAR,
    );
  });

  it('uma venda em aberto não vencida (due_date no futuro) → REGULAR', () => {
    const openSales: OpenSaleForStatus[] = [
      { dueDate: new Date(TODAY.getTime() + 86_400_000), balance: 100 },
    ];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.REGULAR,
    );
  });

  it('due_date é HOJE → ainda não vencida (RN-61, limite estrito) → REGULAR', () => {
    const openSales: OpenSaleForStatus[] = [{ dueDate: TODAY, balance: 100 }];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.REGULAR,
    );
  });

  it('vencida há 1 dia → OVERDUE', () => {
    const openSales: OpenSaleForStatus[] = [{ dueDate: daysAgo(1), balance: 100 }];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.OVERDUE,
    );
  });

  it('vencida há 29 dias → OVERDUE', () => {
    const openSales: OpenSaleForStatus[] = [{ dueDate: daysAgo(29), balance: 100 }];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.OVERDUE,
    );
  });

  it('vencida há exatamente 30 dias → DELINQUENT (limite inclusivo)', () => {
    const openSales: OpenSaleForStatus[] = [{ dueDate: daysAgo(30), balance: 100 }];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.DELINQUENT,
    );
  });

  it('vencida há 31 dias → DELINQUENT', () => {
    const openSales: OpenSaleForStatus[] = [{ dueDate: daysAgo(31), balance: 100 }];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.DELINQUENT,
    );
  });

  it('vencida há 40 dias + outra em dia → DELINQUENT (o pior atraso decide)', () => {
    const openSales: OpenSaleForStatus[] = [
      { dueDate: daysAgo(40), balance: 100 },
      { dueDate: new Date(TODAY.getTime() + 86_400_000), balance: 50 },
    ];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.DELINQUENT,
    );
  });

  it('vencida há 5 dias mas já quitada — não está mais em aberto → REGULAR', () => {
    // Uma vez paga, a venda simplesmente não entra em `openSales`.
    expect(decideCustomerFinancialStatus([], TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.REGULAR,
    );
  });

  it('vencida com saldo residual de R$ 0,01 → OVERDUE', () => {
    const openSales: OpenSaleForStatus[] = [{ dueDate: daysAgo(1), balance: 0.01 }];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.OVERDUE,
    );
  });

  it('saldo zerado não conta como em aberto, mesmo vencida', () => {
    const openSales: OpenSaleForStatus[] = [{ dueDate: daysAgo(40), balance: 0 }];
    expect(decideCustomerFinancialStatus(openSales, TODAY, DELINQUENCY_DAYS)).toBe(
      CustomerFinancialStatus.REGULAR,
    );
  });

  it('delinquencyDays customizado (15) — respeita o parâmetro', () => {
    const openSales: OpenSaleForStatus[] = [{ dueDate: daysAgo(15), balance: 100 }];
    expect(decideCustomerFinancialStatus(openSales, TODAY, 15)).toBe(
      CustomerFinancialStatus.DELINQUENT,
    );
    expect(decideCustomerFinancialStatus(openSales, TODAY, 16)).toBe(
      CustomerFinancialStatus.OVERDUE,
    );
  });
});
