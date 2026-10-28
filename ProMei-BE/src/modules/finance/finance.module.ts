import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FinanceSettingsController } from './finance-settings.controller';
import { FinanceSettingsService } from './finance-settings.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [FinanceSettingsController],
  providers: [FinanceSettingsService],
  exports: [FinanceSettingsService],
})
export class FinanceModule {}
