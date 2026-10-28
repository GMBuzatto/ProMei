#!/bin/sh
# env-compliance.ts (docs/16-configuracao-sem-hardcode.md) exige um .env
# fisico em disco com todas as chaves de .env.example preenchidas. Containers
# (Railway, docker-compose) entregam config como variavel de ambiente do
# processo, nao como arquivo — este entrypoint materializa /app/.env a partir
# do ambiente antes de subir a aplicacao.
#
# Depois disso, e antes de entregar a porta para a API, o container coloca o
# banco no estado esperado: aplica as migracoes pendentes e roda o bootstrap
# idempotente (papel restrito, catalogo de permissoes, planos, Super Admin
# inicial). Migrar aqui, e nao por fora, evita expor o Postgres na internet so
# para rodar `migrate deploy` — a DATABASE_URL nunca sai da rede privada do
# Railway.
set -e

ENV_FILE="/app/.env"
EXAMPLE_FILE="/app/.env.example"

: > "$ENV_FILE"
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|'#'*) continue ;;
  esac
  key=$(printf '%s' "$line" | cut -d '=' -f1 | tr -d '[:space:]')
  [ -z "$key" ] && continue
  eval "value=\${$key:-}"
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
done < "$EXAMPLE_FILE"

# RUN_MIGRATIONS=false desliga a etapa de banco — util para subir uma replica
# extra ou depurar o boot sem tocar no schema.
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ -d /app/.migrate ]; then
  echo "[entrypoint] aplicando migracoes..."
  (cd /app/.migrate && ./node_modules/.bin/prisma migrate deploy)

  echo "[entrypoint] bootstrap do banco..."
  node /app/dist/scripts/bootstrap-db.js
fi

exec "$@"
