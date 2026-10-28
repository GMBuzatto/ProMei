import { IsString, IsUUID, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from './change-password.dto';

/**
 * Reset feito por admin (RF-04, sem e-mail no MVP): o admin define a senha e
 * repassa ao usuário por fora. O usuário é obrigado a trocar no primeiro acesso.
 */
export class ResetPasswordDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  newPassword!: string;
}
