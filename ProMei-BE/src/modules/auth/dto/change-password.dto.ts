import { IsString, MinLength } from 'class-validator';

/** Política mínima de senha (docs/09): tamanho mínimo comum a troca e reset. */
export const MIN_PASSWORD_LENGTH = 12;

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  newPassword!: string;
}
