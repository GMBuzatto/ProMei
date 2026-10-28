import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/** RF-34: histórico de movimentações filtrável por item e por período. */
export class ListStockMovementsQueryDto {
  @IsOptional()
  @IsUUID()
  itemId?: string;

  /** Inclusivo, comparado contra `createdAt`. */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Inclusivo, comparado contra `createdAt`. */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Sem teto fixo aqui: o máximo vem de PAGINATION_MAX_LIMIT (docs/16), aplicado no service. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
