-- Tabela `payments` + `receipts.sale_id` (docs/19, docs/22, docs/23, docs/27).
-- Pré-requisito de 10.5 (venda à vista completa): ela nasce PAID com um
-- Payment de valor total já registrado, e gera UM comprovante por venda,
-- nunca um por item (RN-86) — os dois exigem estas tabelas existirem antes
-- do service. Corresponde aos passos 5 (create_payments) e 9
-- (alter_receipts_add_sale) de docs/27#ordem-das-migrações.

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "sale_id" UUID;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "customer_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "payment_method" NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "reversed_by" UUID,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_sale_id_idx" ON "payments"("sale_id");

-- CreateIndex
CREATE INDEX "payments_company_id_paid_at_idx" ON "payments"("company_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_company_id_customer_id_paid_at_idx" ON "payments"("company_id", "customer_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_company_id_method_paid_at_idx" ON "payments"("company_id", "method", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_sale_id_key" ON "receipts"("sale_id");

-- CreateIndex
--
-- Âncora da FK composta com o tenant (docs/27), mesmo papel de
-- `customers_id_company_uniq`/`items_id_company_uniq`: permite `payments`
-- referenciar `(sale_id, company_id)`.
CREATE UNIQUE INDEX "sales_id_company_uniq" ON "sales"("id", "company_id");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- FK composta com o tenant (docs/27): veda recebimento de outra empresa
-- apontando para esta venda, mesmo padrão de `sales_customer_same_company`
-- e `sale_items_item_same_company`.
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_same_company" FOREIGN KEY ("sale_id", "company_id") REFERENCES "sales"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK (docs/27) — Prisma não modela CHECK, então entram à mão.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive"
  CHECK ("amount" > 0);

-- Estorno preenche os três campos JUNTOS (RN-74), nunca parcialmente.
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversal_fields" CHECK (
  ("reversed_at" IS NULL     AND "reversed_by" IS NULL     AND "reversal_reason" IS NULL) OR
  ("reversed_at" IS NOT NULL AND "reversed_by" IS NOT NULL AND "reversal_reason" IS NOT NULL)
);

-- RLS — segunda barreira de isolamento (ADR-0003, docs/09), mesmo padrão
-- das migrações anteriores da fase 2.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payments"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());
