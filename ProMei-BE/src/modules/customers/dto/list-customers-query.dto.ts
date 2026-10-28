import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CustomerFinancialStatus, CustomerStatus } from '../../../generated/prisma/client';

/** Consulta com busca, filtro por status/situação financeira e paginação. */
export class ListCustomersQueryDto {
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

  /** Busca textual em nome, documento, e-mail e telefone. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  /**
   * Sem filtro, a listagem devolve ativos e inativos. Inativo não some do
   * sistema (RN-33) e continua consultável — quem quiser só os em uso pede
   * `?status=ACTIVE`.
   */
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsEnum(CustomerFinancialStatus)
  financialStatus?: CustomerFinancialStatus;
}
