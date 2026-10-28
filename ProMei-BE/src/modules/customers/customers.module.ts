import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuditModule, FinanceModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
