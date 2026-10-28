import { StockMovementType } from '../../generated/prisma/client';

/**
 * Quanto a movimentação soma ao saldo do item (RF-32).
 *
 * A direção mora no `type`, não no sinal da quantidade: saída de 10 chega como
 * `quantity: 10` e vira `-10` aqui. O ajuste é a exceção — ele já vem assinado,
 * porque correção é a diferença entre o saldo registrado e o contado (RN-22).
 */
export function resolveStockDelta(type: StockMovementType, quantity: number): number {
  return type === StockMovementType.OUT ? -quantity : quantity;
}

/**
 * Só o ajuste aceita quantidade negativa. Entrada e saída negativas seriam a
 * mesma operação escrita de duas formas, e um sinal trocado viraria movimentação
 * invertida sem ninguém perceber.
 */
export function acceptsNegativeQuantity(type: StockMovementType): boolean {
  return type === StockMovementType.ADJUSTMENT;
}
