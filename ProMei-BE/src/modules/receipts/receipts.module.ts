import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceiptStorageService } from './receipt-storage.service';

/**
 * `ReceiptsService` é exportado porque o fluxo de saída (InventoryModule) emite
 * o comprovante dentro da própria transação da movimentação.
 */
@Module({
  imports: [AuditModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptPdfService, ReceiptStorageService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
