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
 * `creditLimit`, `blockedForCredit` e `financialStatus` ficam de fora de
 * propósito (docs/18, PD-16).
 *
 * `creditLimit` e `blockedForCredit` só mudam pelas rotas dedicadas
 * `PATCH /customers/:id/credit-limit` e `.../credit-block`, com permissão
 * própria (`customer-credit:update`) — se `customers:create` também pudesse
 * gravar um limite ou bloqueio iniciais, a separação de privilégio que essas
 * rotas existem para impor ficaria furada desde o cadastro.
 *
 * `financialStatus` é sempre derivado (`customer-status.policy.ts`, RN-34) —
 * nunca digitado, nem aqui nem em lugar nenhum.
 *
 * `status` também fica de fora: cliente novo sempre nasce `ACTIVE`, e a
 * transição tem rota própria (`PATCH /customers/:id/status`), mesmo padrão
 * de `CreateItemDto`.
 */
export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  // RN-31: único por empresa quando informado — checado no service, com o
  // índice único parcial como garantia final contra corrida.
  //
  // Forma validada (docs/28): só dígitos, 11 (CPF) ou 14 (CNPJ). O documento
  // continua OPCIONAL de propósito (docs/18) — exigir CPF no balcão empurra o
  // operador para a venda sem cliente. O que não vale é aceitar um documento
  // deformado: ele vira chave de unicidade por empresa, e chave torta duplica
  // cadastro em vez de impedir.
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

  // Endereço em bloco, sem schema fixo (docs/18: não há busca por CEP na fase 2).
  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
