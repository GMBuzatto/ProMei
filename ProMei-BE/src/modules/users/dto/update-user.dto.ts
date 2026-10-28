import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { UserStatus } from '../../../generated/prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
