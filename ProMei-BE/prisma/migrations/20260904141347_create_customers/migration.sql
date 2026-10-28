-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "notes" TEXT,
    "credit_limit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "customer_status" NOT NULL DEFAULT 'ACTIVE',
    "financial_status" "customer_financial_status" NOT NULL DEFAULT 'REGULAR',
    "blocked_for_credit" BOOLEAN NOT NULL DEFAULT false,
    "anonymized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_company_id_idx" ON "customers"("company_id");

-- CreateIndex
CREATE INDEX "customers_company_id_status_idx" ON "customers"("company_id", "status");

-- CreateIndex
CREATE INDEX "customers_company_id_financial_status_idx" ON "customers"("company_id", "financial_status");

-- CreateIndex
CREATE INDEX "customers_company_id_name_idx" ON "customers"("company_id", "name");

-- CreateIndex
--
-- PARCIAL de propósito (docs/27): Prisma não modela índice único parcial, e
-- a versão gerada acima seria um único comum. No Postgres NULL já não
-- colide num índice único comum, mas o WHERE deixa a intenção explícita em
-- vez de depender desse comportamento — e sobrevive a uma troca de SGBD.
CREATE UNIQUE INDEX "customers_company_document_uniq" ON "customers"("company_id", "document") WHERE "document" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK (docs/27) — Prisma não modela CHECK, então entra à mão.
ALTER TABLE "customers" ADD CONSTRAINT "customers_credit_limit_not_negative"
  CHECK ("credit_limit" >= 0);

-- Âncora da FK composta com o tenant (docs/27): tabelas futuras que
-- referenciam cliente (sales, e por elas payments/sale_authorizations)
-- fazem FOREIGN KEY (customer_id, company_id) REFERENCES customers (id,
-- company_id) — a barreira que pega "venda da empresa A apontando para
-- cliente da empresa B" que nenhuma Client Extension alcança.
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_company_uniq" UNIQUE ("id", "company_id");

-- RLS — segunda barreira de isolamento (ADR-0003, docs/09), mesmo padrão da
-- migração 20260808120000. app_current_company_id()/app_has_platform_access()
-- já existem desde ela.
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customers"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());
