import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, SaleKind } from '../../../generated/prisma/client';
import { CreateSaleItemDto } from './create-sale-item.dto';

/**
 * `POST /sales` (docs/28). `customerId` e `dueDate` só fazem sentido —  e só
 * são exigidos — em `CREDIT`; `paymentMethod` só em `CASH`. Um `customerId`
 * enviado numa venda `CASH` é ignorado pelo service (docs/19: venda à
 * vista não exige cliente).
 */
export class CreateSaleDto {
  @IsEnum(SaleKind)
  kind: SaleKind;

  // RN-41: venda a prazo sem cliente é impossível por construção (CHECK no
  // banco); aqui é só a primeira barreira, mais cedo e com mensagem melhor.
  @ValidateIf((dto: CreateSaleDto) => dto.kind === SaleKind.CREDIT)
  @IsUUID()
  customerId?: string;

  @ValidateIf((dto: CreateSaleDto) => dto.kind === SaleKind.CASH)
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  // Opcional em CREDIT: omitido, o service aplica o prazo padrão da
  // empresa sobre `soldAt` (docs/19). Validado só quando informado — a
  // obrigatoriedade em CREDIT é decidida no service, depois do default.
  @ValidateIf((dto: CreateSaleDto) => dto.dueDate !== undefined)
  @IsDateString()
  dueDate?: string;

  // CHECK (discount >= 0) no banco; desconto >= soma dos itens é
  // VALIDACAO_FALHOU no service (sale-totals.ts#isDiscountValid).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // Teto real (SALES_MAX_ITEMS_PER_SALE) checado no service — vem de env,
  // não cabe em decorator estático (docs/16).
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];
}
