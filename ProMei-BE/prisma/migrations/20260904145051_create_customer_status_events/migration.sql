-- Histórico append-only de situação financeira (docs/18, docs/21, RN-66).
--
-- `sale_id`/`payment_id` são colunas UUID soltas de propósito: `sales` e
-- `payments` ainda não existem (épicos 10/11). A FK entra numa migração
-- futura, quando as tabelas existirem — igual ao padrão já usado em
-- `stock_movements.sale_id`/`receipts.sale_id` (docs/27).

-- CreateTable
CREATE TABLE "customer_status_events" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "from_status" "customer_financial_status",
    "to_status" "customer_financial_status" NOT NULL,
    "reason" "customer_status_reason" NOT NULL,
    "sale_id" UUID,
    "payment_id" UUID,
    "user_id" UUID,
    "context" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_status_events_company_id_customer_id_created_at_idx" ON "customer_status_events"("company_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_status_events_company_id_to_status_created_at_idx" ON "customer_status_events"("company_id", "to_status", "created_at");

-- AddForeignKey
ALTER TABLE "customer_status_events" ADD CONSTRAINT "customer_status_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_status_events" ADD CONSTRAINT "customer_status_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_status_events" ADD CONSTRAINT "customer_status_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only de verdade (RN-66), mesmo tratamento de
-- `20260812100000_audit_logs_append_only`: UPDATE é bloqueado no banco.
-- DELETE segue permitido — retenção/LGPD e limpeza de teste não são
-- "reescrever o que aconteceu", são apagar em bloco.
CREATE OR REPLACE FUNCTION customer_status_events_forbid_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'customer_status_events e append-only: UPDATE nao e permitido (RN-66)'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS customer_status_events_no_update ON "customer_status_events";

CREATE TRIGGER customer_status_events_no_update
  BEFORE UPDATE ON "customer_status_events"
  FOR EACH ROW
  EXECUTE FUNCTION customer_status_events_forbid_update();

-- RLS — segunda barreira de isolamento (ADR-0003, docs/09), mesmo padrão da
-- migração 20260808120000. app_current_company_id()/app_has_platform_access()
-- já existem desde ela.
ALTER TABLE "customer_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_status_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customer_status_events"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());
