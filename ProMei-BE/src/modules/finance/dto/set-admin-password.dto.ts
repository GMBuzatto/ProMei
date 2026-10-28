import { IsString, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../../auth/dto/change-password.dto';

/**
 * `currentPassword` é a senha de LOGIN do usuário autenticado, não a senha
 * administrativa antiga (docs/20, PD-13): exigir a antiga trancaria a
 * empresa para fora se ela tivesse sido esquecida ou vazado — e é
 * justamente numa dessas duas situações que alguém precisa trocá-la.
 */
export class SetAdminPasswordDto {
  @IsString()
  currentPassword!: string;

  // Mesma política mínima das senhas de usuário (docs/09): não é "só um PIN".
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `newAdminPassword must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  newAdminPassword!: string;
}
