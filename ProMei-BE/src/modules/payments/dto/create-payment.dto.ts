import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../../../generated/prisma/client';

/**
 * `POST /payments` (docs/22, docs/28). `paidAt` opcional: omitido, o
 * service usa o instante da requisição; informado, permite lançar um
 * recebimento de ontem — mas nunca do futuro (validado no service, com a
 * tolerância do fuso da empresa).
 */
export class CreatePaymentDto {
  @IsUUID()
  saleId: string;

  // CHECK (amount > 0) no banco; com 2 casas, o menor valor válido é 0,01.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
