import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

/**
 * Atualização parcial do item. Todo campo é opcional, mas nenhum aceita valor
 * vazio — `MinLength(1)` impede que um PATCH apague `name`/`unit`, que RN-25
 * exige preenchidos.
 *
 * `status` fica de fora: a transição ativo ⇄ inativo tem rota própria
 * (`PATCH /items/:id/status`), para a máquina de estados viver em um lugar só.
 * `stock` também fica de fora — só movimentação altera saldo (RF-32/RN-22).
 */
export class UpdateItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  unit?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  category?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStock?: number;
}
