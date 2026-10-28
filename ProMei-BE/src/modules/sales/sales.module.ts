import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance';
import { ReceiptsModule } from '../receipts';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SaleValidationService } from './sale-validation.service';

@Module({
  imports: [AuditModule, ReceiptsModule, FinanceModule],
  controllers: [SalesController],
  providers: [SalesService, SaleValidationService],
  exports: [SalesService],
})
export class SalesModule {}
