import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuditModule, FinanceModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
