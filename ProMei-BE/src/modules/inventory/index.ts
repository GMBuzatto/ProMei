export { InventoryModule } from './inventory.module';
export { InventoryService } from './inventory.service';
export type {
  MovementItemSnapshot,
  StockMovementResult,
  PaginatedResult,
  StockMovementHistoryEntry,
} from './inventory.service';
export { acceptsNegativeQuantity, resolveStockDelta } from './stock-delta';
