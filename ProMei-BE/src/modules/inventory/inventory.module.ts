import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReceiptsModule } from '../receipts';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuditModule, ReceiptsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
