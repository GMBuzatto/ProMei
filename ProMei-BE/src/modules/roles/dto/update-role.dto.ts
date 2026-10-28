import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PERMISSION_PATTERN } from './create-role.dto';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  /** Quando enviado, **substitui** o conjunto de permissões do papel. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Matches(PERMISSION_PATTERN, {
    each: true,
    message: 'cada permissão deve estar no formato recurso:ação (ex.: items:create)',
  })
  permissions?: string[];
}
