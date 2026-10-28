import { CompanyStatus } from '../../../generated/prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateCompanyStatusDto {
  @IsEnum(CompanyStatus)
  status: CompanyStatus;
}
