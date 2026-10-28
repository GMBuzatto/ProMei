-- Row-Level Security como SEGUNDA barreira de isolamento (ADR-0003, docs/09).
--
-- A primeira barreira é a Client Extension na aplicação. Esta aqui protege
-- contra o que a extension não alcança: query escrita com o client cru, bug
-- futuro, acesso direto via psql ou ferramenta externa.
--
-- Contrato das policies:
--   app.current_company_id  -> UUID do tenant da requisição
--   app.platform_access     -> 'on' para Super Admin/Staff e para fluxos sem
--                              tenant (login por e-mail, seed, migrações)
--
-- Sem NENHUMA das duas configuradas, nenhuma linha é visível — é isso que faz
-- um SELECT direto no banco não devolver dados de empresa alguma.

CREATE OR REPLACE FUNCTION app_current_company_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_has_platform_access() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.platform_access', true), '') = 'on'
$$;

-- companies: o escopo é o próprio id, não company_id.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "companies"
  USING (app_has_platform_access() OR id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR id = app_current_company_id());

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "roles"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscriptions"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());

ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "items"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());

ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_movements"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());

ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "receipts"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (app_has_platform_access() OR company_id = app_current_company_id())
  WITH CHECK (app_has_platform_access() OR company_id = app_current_company_id());

-- Tabelas globais da plataforma (permissions, plans, role_permissions,
-- user_roles, refresh_tokens) NÃO recebem RLS: não têm company_id. A ausência é
-- intencional e está documentada aqui para não parecer esquecimento.
