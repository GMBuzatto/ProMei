import {
  IsInt,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Mesma checagem de `FINANCE_DEFAULT_TIMEZONE` em `env.schema.ts`: um fuso
 * inválido não falha na hora, aparece meses depois como venda no período
 * errado. `Intl` lança `RangeError` para identificador IANA desconhecido.
 */
@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'timezone precisa ser um fuso IANA válido (ex.: America/Sao_Paulo).';
  }
}

/**
 * PUT é substituição integral — os quatro campos são obrigatórios. Nunca tem
 * `adminPasswordHash` (nem qualquer campo de senha administrativa): o
 * `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`) já rejeita
 * com 400 qualquer campo fora desta lista, então a senha não tem como entrar
 * por aqui mesmo que o cliente tente.
 */
export class UpdateFinanceSettingsDto {
  // RN-53: dia maior que o mês satura no último dia — a faixa aqui só barra o
  // absurdo (0, 32); a saturação em si é regra de `finance/period.ts`.
  @IsInt()
  @Min(1)
  @Max(31)
  closingDay: number;

  @IsString()
  @Validate(IsIanaTimeZoneConstraint)
  timezone: string;

  @IsInt()
  @Min(1)
  delinquencyDays: number;

  @IsInt()
  @Min(1)
  defaultDueDays: number;
}
