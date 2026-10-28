import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotIn, IsString, IsUUID, MinLength } from 'class-validator';
import { StockMovementType } from '../../../generated/prisma/client';

/**
 * RF-32: entrada, saída e ajuste — sempre com quem/quando/quantidade/motivo.
 * "Quem" e "quando" o service preenche (usuário do JWT e `created_at`); o
 * cliente informa o resto.
 */
export class CreateStockMovementDto {
  @IsUUID()
  itemId: string;

  @IsEnum(StockMovementType)
  type: StockMovementType;

  /**
   * Quanto o saldo se move, **não** o saldo final.
   *
   * - `IN` e `OUT`: sempre positiva. O tipo já diz a direção (saída de 10
   *   registra `quantity: 10` e subtrai 10).
   * - `ADJUSTMENT`: assinada. `-3` corrige um saldo inflado, `+3` um saldo
   *   defasado. É a única com sinal porque correção é justamente a diferença
   *   entre o registrado e o contado (RN-22).
   *
   * Zero é recusado nos três: movimentação que não move nada é ruído no
   * histórico. O teto (em módulo) vem de `INVENTORY_MAX_MOVEMENT_QUANTITY` e é
   * aplicado no service — aqui não cabe valor fixo (docs/16).
   */
  @Type(() => Number)
  @IsInt()
  @IsNotIn([0], { message: 'quantity não pode ser zero' })
  quantity: number;

  /** Obrigatório em todos os tipos: RF-32 exige motivo em toda movimentação. */
  @IsString()
  @MinLength(1)
  reason: string;
}
