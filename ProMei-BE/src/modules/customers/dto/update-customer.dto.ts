import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Atualização parcial do cadastro. Todo campo é opcional, mas nenhum aceita
 * valor vazio quando enviado.
 *
 * `creditLimit`, `blockedForCredit` e `financialStatus` NÃO estão aqui — de
 * propósito, o mesmo motivo do `CreateCustomerDto`: editar cadastro não
 * implica poder dar ou negar crédito (docs/18, PD-16); os dois primeiros têm
 * rota e permissão próprias (`customer-credit:update`), o terceiro é sempre
 * derivado, nunca digitado.
 *
 * `status` também fica de fora: a transição ativo ⇄ inativo tem rota própria
 * (`PATCH /customers/:id/status`), para a máquina de estados viver em um
 * lugar só — mesmo padrão de `UpdateItemDto`.
 */
export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  /** Mesma forma do cadastro (docs/28): só dígitos, 11 (CPF) ou 14 (CNPJ). */
  @IsOptional()
  @Matches(/^(\d{11}|\d{14})$/, {
    message: 'document deve conter apenas dígitos, com 11 (CPF) ou 14 (CNPJ) posições',
  })
  document?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
