import { IsEnum } from 'class-validator';
import { ItemStatus } from '../../../generated/prisma/client';

/** Máquina de estados do item (docs/04): ativo ⇄ inativo, nunca exclusão. */
export class UpdateItemStatusDto {
  @IsEnum(ItemStatus)
  status: ItemStatus;
}
