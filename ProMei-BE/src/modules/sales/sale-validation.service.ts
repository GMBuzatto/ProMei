import { Injectable } from '@nestjs/common';
import {
  CustomerFinancialStatus,
  CustomerStatus,
  ItemStatus,
  Prisma,
  SaleBlockReason,
} from '../../generated/prisma/client';

/**
 * Um bloqueio de venda (docs/19#validação, docs/28#erros). `authorizable`
 * já sai calculado: o front não recalcula regra de negócio para decidir se
 * mostra "Liberar venda".
 */
export interface SaleBlock {
  reason: SaleBlockReason;
  authorizable: boolean;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Item travado (`SELECT ... FOR UPDATE`) com a quantidade pedida NESTA
 * venda já consolidada por item (RN-83): duas linhas do mesmo item somam
 * antes de chegar aqui.
 */
export interface LockedSaleItem {
  itemId: string;
  sku: string;
  status: ItemStatus;
  stock: number;
  requestedQuantity: number;
}

/**
 * Tudo que a checagem de crédito precisa, já lido dentro da transação com
 * o cliente sob advisory lock (docs/20#concorrência). `financialStatus` é o
 * RECOMPUTADO por `customer-status.policy.ts` sobre as vendas em aberto —
 * nunca `customers.financial_status` (docs/18#situação-financeira, RN-34):
 * o campo materializado serve para listar e filtrar, a decisão de crédito
 * lê a fonte.
 */
export interface CreditCheckInput {
  customerStatus: CustomerStatus;
  blockedForCredit: boolean;
  financialStatus: CustomerFinancialStatus;
  creditLimit: Prisma.Decimal;
  /** Σ sales.total do período corrente (docs/20#fórmula), antes desta venda. */
  usedInPeriod: Prisma.Decimal;
  saleTotal: Prisma.Decimal;
}

/**
 * Coleta os bloqueios de uma venda (docs/19, RN-47): SEMPRE todos de uma
 * vez, nunca lança no primeiro. Quem chama decide o que fazer com a lista
 * vazia (nada) ou não-vazia (422 `VENDA_BLOQUEADA`).
 */
@Injectable()
export class SaleValidationService {
  /** RN-21/RN-84/RN-85, RN-23: item inativo e estoque insuficiente — os dois não liberáveis. */
  collectItemBlocks(items: LockedSaleItem[]): SaleBlock[] {
    const blocks: SaleBlock[] = [];

    const inactiveItems = items.filter((item) => item.status !== ItemStatus.ACTIVE);
    if (inactiveItems.length > 0) {
      blocks.push({
        reason: SaleBlockReason.ITEM_INACTIVE,
        authorizable: false,
        message: `Item inativo: ${inactiveItems.map((item) => item.sku).join(', ')}. Reative-o para registrar a venda.`,
        details: {
          items: inactiveItems.map((item) => ({ itemId: item.itemId, sku: item.sku })),
        },
      });
    }

    // Não há liberação administrativa possível para este bloqueio (PD-01):
    // estoque negativo não existe em nenhum caminho.
    const insufficientItems = items.filter((item) => item.requestedQuantity > item.stock);
    if (insufficientItems.length > 0) {
      blocks.push({
        reason: SaleBlockReason.INSUFFICIENT_STOCK,
        authorizable: false,
        message: this.buildInsufficientStockMessage(insufficientItems),
        details: {
          items: insufficientItems.map((item) => ({
            itemId: item.itemId,
            sku: item.sku,
            available: item.stock,
            requested: item.requestedQuantity,
          })),
        },
      });
    }

    return blocks;
  }

  /**
   * Só se aplica a venda a PRAZO (docs/19, docs/20, docs/21). Três dos
   * quatro bloqueios são liberáveis (`INSUFFICIENT_LIMIT`, `OVERDUE_PAYMENT`,
   * `CUSTOMER_DELINQUENT`) — é a única categoria com liberação
   * administrativa possível hoje (PD-01, docs/24). `CUSTOMER_INACTIVE` e
   * `CUSTOMER_BLOCKED` não são: reativar o cadastro ou desbloquear crédito
   * já tem rota própria, uma senha administrativa não deveria contornar
   * isso.
   */
  collectCreditBlocks(input: CreditCheckInput): SaleBlock[] {
    const blocks: SaleBlock[] = [];

    if (input.customerStatus !== CustomerStatus.ACTIVE) {
      blocks.push({
        reason: SaleBlockReason.CUSTOMER_INACTIVE,
        authorizable: false,
        message: 'Cliente inativo: reative o cadastro para vender a prazo.',
        details: {},
      });
    }

    if (input.blockedForCredit) {
      blocks.push({
        reason: SaleBlockReason.CUSTOMER_BLOCKED,
        authorizable: false,
        message: 'Cliente bloqueado para crédito.',
        details: {},
      });
    }

    // RN-62/RN-63: DELINQUENT vence OVERDUE — são níveis do mesmo eixo, o
    // pior entre os dois é o que decide, nunca os dois juntos.
    if (input.financialStatus === CustomerFinancialStatus.DELINQUENT) {
      blocks.push({
        reason: SaleBlockReason.CUSTOMER_DELINQUENT,
        authorizable: true,
        message: 'Cliente inadimplente: venda vencida há mais tempo do que o tolerado.',
        details: {},
      });
    } else if (input.financialStatus === CustomerFinancialStatus.OVERDUE) {
      blocks.push({
        reason: SaleBlockReason.OVERDUE_PAYMENT,
        authorizable: true,
        message: 'Cliente tem venda vencida em aberto.',
        details: {},
      });
    }

    const projectedUsed = input.usedInPeriod.plus(input.saleTotal);
    if (projectedUsed.gt(input.creditLimit)) {
      const available = input.creditLimit.minus(input.usedInPeriod);

      blocks.push({
        reason: SaleBlockReason.INSUFFICIENT_LIMIT,
        authorizable: true,
        message: `Limite disponível de ${this.formatBrl(available)} é menor que o total de ${this.formatBrl(input.saleTotal)}.`,
        details: {
          creditLimit: input.creditLimit.toFixed(2),
          periodUsed: input.usedInPeriod.toFixed(2),
          available: available.toFixed(2),
          saleTotal: input.saleTotal.toFixed(2),
        },
      });
    }

    return blocks;
  }

  /** Todos os itens sem saldo, não só o primeiro (docs/23). */
  private buildInsufficientStockMessage(items: LockedSaleItem[]): string {
    const parts = items
      .map(
        (item) =>
          `${item.sku} — disponível ${String(item.stock)}, solicitado ${String(item.requestedQuantity)}`,
      )
      .join('; ');

    return `Quantidade solicitada superior ao estoque disponível: ${parts}. Registre a entrada do estoque antes de vender.`;
  }

  private formatBrl(value: Prisma.Decimal): string {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  }
}
