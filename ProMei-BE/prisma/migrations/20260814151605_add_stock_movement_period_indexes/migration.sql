-- CreateIndex
CREATE INDEX "stock_movements_company_id_item_id_created_at_idx" ON "stock_movements"("company_id", "item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_created_at_idx" ON "stock_movements"("company_id", "created_at");
