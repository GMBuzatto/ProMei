-- Fato de negócio da venda + item da venda (docs/19, docs/23, docs/27,
-- ADR-0006, RN-40 a RN-47). Migração `create_sales_and_sale_items`
-- (docs/27#ordem-das-migrações, passo 4).
--
-- Venda é criada e confirmada na MESMA transação (ADR-0006): não existe
-- rascunho persistido nem estado BLOCKED. As invariantes que não podem
-- depender de código correto viram CHECK no banco (fim deste arquivo).

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID,
    "number" BIGINT NOT NULL,
    "kind" "sale_kind" NOT NULL,
    "status" "sale_status" NOT NULL DEFAULT 'PENDING',
    "payment_method" "payment_method",
    "total" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "due_date" DATE,
    "sold_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "canceled_at" TIMESTAMPTZ(3),
    "canceled_by" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "item_name_snapshot" TEXT NOT NULL,
    "item_sku_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_company_id_number_key" ON "sales"("company_id", "number");

-- CreateIndex
CREATE INDEX "sales_company_id_sold_at_idx" ON "sales"("company_id", "sold_at");

-- CreateIndex
CREATE INDEX "sales_company_id_status_due_date_idx" ON "sales"("company_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "sales_company_id_customer_id_sold_at_idx" ON "sales"("company_id", "customer_id", "sold_at");

-- CreateIndex
CREATE INDEX "sales_company_id_customer_id_kind_sold_at_idx" ON "sales"("company_id", "customer_id", "kind", "sold_at");

-- CreateIndex
CREATE INDEX "sales_company_id_created_by_idx" ON "sales"("company_id", "created_by");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_company_id_item_id_idx" ON "sale_items"("company_id", "item_id");

-- CreateIndex
--
-- Âncora da FK composta com o tenant (docs/27), mesmo papel de
-- `customers_id_company_uniq` (20260904141347): permite `sale_items`
-- referenciar `(item_id, company_id)` e barrar item de outra empresa numa
-- venda.
CREATE UNIQUE INDEX "items_id_company_uniq" ON "items"("id", "company_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- FK composta com o tenant (docs/27): a barreira que nenhuma Client
-- Extension pega — veda venda da empresa A apontando para cliente da
-- empresa B, mesmo com o escopo de tenant funcionando na aplicação.
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_same_company" FOREIGN KEY ("customer_id", "company_id") REFERENCES "customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_canceled_by_fkey" FOREIGN KEY ("canceled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- Mesmo papel de `sales_customer_same_company`: veda item de outra empresa
-- numa venda (docs/27, "o mesmo padrão vale para sale_items → items").
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_item_same_company" FOREIGN KEY ("item_id", "company_id") REFERENCES "items"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK (docs/27) — Prisma não modela CHECK, então entram à mão. São as
-- invariantes de coerência do tipo de venda que não podem depender de
-- código correto.
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_positive"
  CHECK ("total" > 0);

ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_not_negative"
  CHECK ("discount" >= 0);

ALTER TABLE "sales" ADD CONSTRAINT "sales_paid_amount_within_total"
  CHECK ("paid_amount" >= 0 AND "paid_amount" <= "total");

ALTER TABLE "sales" ADD CONSTRAINT "sales_credit_requires_customer" CHECK (
  "kind" = 'CASH' OR "customer_id" IS NOT NULL
);

ALTER TABLE "sales" ADD CONSTRAINT "sales_credit_requires_due_date" CHECK (
  "kind" = 'CASH' OR "due_date" IS NOT NULL
);

ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_requires_method" CHECK (
  "kind" = 'CREDIT' OR "payment_method" IS NOT NULL
);

-- CANCELED <=> canceled_at/by/reason preenchidos, juntos ou nenhum.
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancel_fields" CHECK (
  ("status" <> 'CANCELED' AND "canceled_at" IS NULL AND "canceled_by" IS NULL AND "cancel_reason" IS NULL)
  OR
  ("status" =  'CANCELED' AND "canceled_at" IS NOT NULL AND "canceled_by" IS NOT NULL AND "cancel_reason" IS NOT NULL)
);

ALTER TABLE "sales" ADD CONSTRAINT "sales_period_order"
  CHECK ("period_end" > "period_start");

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_positive"
  CHECK ("quantity" > 0);

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_total_positive"
  CHECK ("total" > 0);

-- RLS — segunda barreira de isolamento (ADR-0003, docs/09), mesmo padrão
-- das migrações 20260808120000 / 20260904141347. app_current_company_id()
-- e app_has_platform_access() já existem desde a primeira.
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());

ALTER TABLE "sale_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sale_items"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());
