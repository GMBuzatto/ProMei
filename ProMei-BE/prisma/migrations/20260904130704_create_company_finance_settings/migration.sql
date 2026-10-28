-- Configuração financeira da empresa (docs/20, docs/27): dia de fechamento,
-- fuso, prazos e senha administrativa. Tabela 1:1 com `companies`, e não
-- colunas nela — ciclo de vida e sensibilidade próprios, e a existência da
-- linha responde "a empresa já configurou o financeiro?" sem depender de
-- `closing_day IS NULL`.

-- CreateTable
CREATE TABLE "company_finance_settings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "closing_day" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "delinquency_days" INTEGER NOT NULL,
    "default_due_days" INTEGER NOT NULL,
    "admin_password_hash" TEXT,
    "admin_password_updated_at" TIMESTAMPTZ(3),
    "admin_password_failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "admin_password_locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_finance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_finance_settings_company_id_key" ON "company_finance_settings"("company_id");

-- AddForeignKey
ALTER TABLE "company_finance_settings" ADD CONSTRAINT "company_finance_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECKs (docs/27) — Prisma não modela CHECK, então entram à mão.
-- closing_day > 31 nunca existe em mês nenhum; RN-53 (saturação) é regra de
-- period.ts, não de banco.
ALTER TABLE "company_finance_settings" ADD CONSTRAINT "company_finance_settings_closing_day_range"
  CHECK ("closing_day" BETWEEN 1 AND 31);
ALTER TABLE "company_finance_settings" ADD CONSTRAINT "company_finance_settings_delinquency_days_positive"
  CHECK ("delinquency_days" > 0);
ALTER TABLE "company_finance_settings" ADD CONSTRAINT "company_finance_settings_default_due_days_positive"
  CHECK ("default_due_days" > 0);

-- Backfill obrigatório (docs/27): empresa criada antes da fase 2 fica sem
-- período financeiro e qualquer consulta de limite quebraria. Os valores
-- literais abaixo são os defaults de FINANCE_DEFAULT_CLOSING_DAY,
-- FINANCE_DEFAULT_TIMEZONE, FINANCE_DELINQUENCY_DAYS e FINANCE_DEFAULT_DUE_DAYS
-- em env.config.ts na data desta migração — uma migração SQL não lê env de
-- processo, então o valor precisa ser gravado aqui, uma vez, como dado
-- histórico. Empresa criada a partir daqui ganha a linha no provisionamento
-- (CompaniesService), lendo o env em runtime.
--
-- admin_password_hash fica NULL: liberação administrativa indisponível até
-- alguém configurar a senha — bloqueio é o default (docs/27).
INSERT INTO "company_finance_settings" (
  "id", "company_id", "closing_day", "timezone", "delinquency_days", "default_due_days",
  "admin_password_hash", "admin_password_failed_attempts", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  "id",
  1,                    -- FINANCE_DEFAULT_CLOSING_DAY
  'America/Sao_Paulo',  -- FINANCE_DEFAULT_TIMEZONE
  30,                   -- FINANCE_DELINQUENCY_DAYS
  30,                   -- FINANCE_DEFAULT_DUE_DAYS
  NULL,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "companies";
