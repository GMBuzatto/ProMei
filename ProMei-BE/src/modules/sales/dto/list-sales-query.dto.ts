import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { SaleKind, SaleStatus } from '../../../generated/prisma/client';

/** `GET /sales` (docs/28): filtros + paginação. */
export class ListSalesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(SaleKind)
  kind?: SaleKind;

  /** Sobre `soldAt`. */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /** Sobre `dueDate` — só faz sentido em venda a prazo. */
  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;
}
