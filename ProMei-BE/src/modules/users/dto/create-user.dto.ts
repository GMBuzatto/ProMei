import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../../auth/dto/change-password.dto';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  password!: string;

  /** Papel inicial. Sem ele, o usuário nasce sem permissão nenhuma. */
  @IsOptional()
  @IsUUID()
  roleId?: string;
}
