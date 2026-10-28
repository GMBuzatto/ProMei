import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListPlansQueryDto {
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
