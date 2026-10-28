import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [AuditModule],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
