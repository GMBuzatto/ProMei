-- Trilha de auditoria append-only de verdade (RNF-06, docs/09).
--
-- Até aqui "append-only" era só convenção: o AuditService nunca atualizava
-- registro, mas nada impedia um UPDATE por outro caminho — script de suporte,
-- migração descuidada, ou alguém com acesso ao banco. Trilha que pode ser
-- reescrita não serve como trilha.
--
-- UPDATE é bloqueado no banco. DELETE segue permitido de propósito:
--   - a LGPD exige anonimizar/excluir dados após a retenção (docs/09: 90 dias
--     depois do cancelamento);
--   - os testes de integração limpam a tabela entre cenários.
--
-- Ou seja: apagar em bloco é uma operação legítima e rastreável; alterar um
-- registro pontualmente para esconder o que aconteceu, não.

CREATE OR REPLACE FUNCTION audit_logs_forbid_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs e append-only: UPDATE nao e permitido (RNF-06)'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON "audit_logs";

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_forbid_update();
