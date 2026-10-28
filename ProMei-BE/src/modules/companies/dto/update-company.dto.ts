import { CompanySegment } from '../../../generated/prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  document?: string;

  @IsOptional()
  @IsEnum(CompanySegment)
  segment?: CompanySegment;
}
