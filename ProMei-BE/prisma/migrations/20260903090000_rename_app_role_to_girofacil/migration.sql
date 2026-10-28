-- Rebrand: papel restrito `mahoraga_app` passa a se chamar `girofacil_app`.
--
-- Migração nova em vez de edição da 20260808130000: aquela já foi aplicada, e
-- migração aplicada não se edita (docs/08) — o checksum do Prisma quebraria em
-- todo banco existente.
--
-- Três caminhos, todos idempotentes:
--   1. banco antigo com o papel velho  → renomeia;
--   2. banco novo (o CREATE da migração anterior acabou de rodar) → renomeia;
--   3. papel novo já existe            → não faz nada.
--
-- A senha NÃO é redefinida aqui de propósito. Em Postgres 16 o padrão é
-- scram-sha-256, que não embute o nome do papel, então o RENAME preserva a
-- senha — inclusive a forte que o `bootstrap-db.ts` rotaciona em ambiente
-- gerenciado. Redefinir para um valor conhecido dentro da migração colocaria uma
-- senha de desenvolvimento em produção a cada `migrate deploy`.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mahoraga_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'girofacil_app') THEN
    ALTER ROLE mahoraga_app RENAME TO girofacil_app;
  END IF;

  -- Rede de segurança: banco provisionado fora do fluxo normal, sem nenhum dos
  -- dois papéis. Senha de desenvolvimento, igual à da migração original.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'girofacil_app') THEN
    CREATE ROLE girofacil_app LOGIN PASSWORD 'girofacil_app' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Grants e default privileges acompanham o OID do papel, então o RENAME já os
-- preserva. Reaplicados assim mesmo porque são idempotentes e cobrem o caminho 3
-- (papel criado à mão por alguém, sem os grants).
GRANT USAGE ON SCHEMA public TO girofacil_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO girofacil_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO girofacil_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO girofacil_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO girofacil_app;
