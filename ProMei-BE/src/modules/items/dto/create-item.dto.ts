import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

/**
 * RN-25: obrigatórios são **nome, unidade e preço**. `sku` é opcional — quando
 * não vem, o service gera (ver `sku.ts`).
 *
 * `stock` não está aqui de propósito: saldo só muda por movimentação (RF-32), e
 * aceitar um valor inicial aqui criaria estoque sem lastro no histórico, o que
 * contraria RN-22 (movimentação é a fonte da verdade e é imutável).
 */
export class CreateItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @IsString()
  @MinLength(1)
  unit: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  category?: string;

  /** `Decimal(10,2)` no banco: duas casas e teto de 8 dígitos inteiros. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStock?: number;
}
