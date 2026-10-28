import { IsEmail, IsString, MinLength, IsBoolean, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
