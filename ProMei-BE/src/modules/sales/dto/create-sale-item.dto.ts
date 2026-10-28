import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Uma linha da venda (docs/28). `unitPrice` opcional: omitido, o service usa
 * `items.price` atual; informado, o balcão negociou — a diferença fica
 * auditada (docs/28).
 */
export class CreateSaleItemDto {
  @IsUUID()
  itemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;
}
