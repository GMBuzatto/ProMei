-- Papel de banco que SOFRE Row-Level Security.
--
-- Por que isso é necessário: o usuário criado pelo POSTGRES_USER do container é
-- superusuário, e superusuário ignora RLS mesmo com FORCE. Sem um papel
-- restrito, as policies da migração anterior não têm efeito prático nenhum.
--
-- Uso hoje: acesso direto ao banco (psql, ferramentas de BI, scripts de
-- suporte) e o teste automatizado de isolamento. É este papel que torna
-- verdadeira a afirmação "não retorna dados de outra empresa nem via SQL direto".
--
-- A aplicação ainda conecta com o usuário privilegiado, porque a contagem de
-- tentativas de login e a auditoria precisam persistir mesmo quando a
-- requisição falha — o que não sobrevive à transação por requisição que o RLS
-- exigiria. A barreira da aplicação é a Client Extension de tenant.
--
-- ATENÇÃO: a senha abaixo é de desenvolvimento. Em qualquer ambiente real,
-- rode `ALTER ROLE mahoraga_app WITH PASSWORD '<senha forte>'` no provisionamento.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mahoraga_app') THEN
    CREATE ROLE mahoraga_app LOGIN PASSWORD 'mahoraga_app' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO mahoraga_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mahoraga_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mahoraga_app;

-- Tabelas criadas por migrações futuras já nascem acessíveis a este papel.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mahoraga_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mahoraga_app;
