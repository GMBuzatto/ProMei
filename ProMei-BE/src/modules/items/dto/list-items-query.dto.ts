import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ItemStatus } from '../../../generated/prisma/client';

/** RF-31: consulta com busca, filtro por categoria e paginação. */
export class ListItemsQueryDto {
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

  /** Busca textual em nome, SKU e descrição. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  category?: string;

  /**
   * Sem filtro, a listagem devolve ativos e inativos. Inativo não some do
   * sistema (RN-23) e continua consultável — quem quiser só o catálogo em uso
   * pede `?status=ACTIVE`.
   */
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}
