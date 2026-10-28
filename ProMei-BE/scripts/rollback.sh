#!/usr/bin/env bash
# Rollback de deploy no Railway: reverte o servico (staging ou producao) para
# o deployment anterior bem-sucedido, via API GraphQL publica do Railway
# (docs/11-infra-ci-cd.md: "Rollback: redeploy da imagem anterior").
#
# Uso:
#   RAILWAY_TOKEN=... RAILWAY_PROJECT_ID=... RAILWAY_SERVICE_ID=... \
#   RAILWAY_ENVIRONMENT_ID=... scripts/rollback.sh [--to <deployment_id>]
#
# Sem --to, busca os deployments recentes do servico e reverte para o
# primeiro anterior ao atual com status SUCCESS e canRollback=true.
#
# IDs de projeto/servico/ambiente: `railway status --json` (com o diretorio
# linkado via `railway link`) ou na URL do dashboard do Railway.
set -euo pipefail

: "${RAILWAY_TOKEN:?RAILWAY_TOKEN nao definido}"
: "${RAILWAY_PROJECT_ID:?RAILWAY_PROJECT_ID nao definido}"
: "${RAILWAY_SERVICE_ID:?RAILWAY_SERVICE_ID nao definido}"
: "${RAILWAY_ENVIRONMENT_ID:?RAILWAY_ENVIRONMENT_ID nao definido}"

API_URL="https://backboard.railway.com/graphql/v2"

TARGET_ID=""
if [ "${1:-}" = "--to" ]; then
  TARGET_ID="${2:?informe o deployment id apos --to}"
fi

graphql() {
  curl -sS -X POST "$API_URL" \
    -H "Project-Access-Token: $RAILWAY_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$1"
}

if [ -z "$TARGET_ID" ]; then
  echo "Buscando deployments recentes do servico..." >&2

  query=$(jq -nc \
    --arg projectId "$RAILWAY_PROJECT_ID" \
    --arg serviceId "$RAILWAY_SERVICE_ID" \
    --arg environmentId "$RAILWAY_ENVIRONMENT_ID" \
    '{
      query: "query Deployments($projectId: String!, $serviceId: String!, $environmentId: String!) { deployments(input: { projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId }, first: 10) { edges { node { id status canRollback createdAt } } } }",
      variables: { projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId }
    }')

  response=$(graphql "$query")

  if echo "$response" | jq -e '.errors' >/dev/null 2>&1; then
    echo "Erro na API do Railway: $(echo "$response" | jq -c '.errors')" >&2
    exit 1
  fi

  # O primeiro item e o deployment atual (no ar agora); procura o proximo
  # SUCCESS + canRollback=true depois dele.
  TARGET_ID=$(echo "$response" | jq -r '
    [.data.deployments.edges[].node] as $d
    | ($d[1:][] | select(.status == "SUCCESS" and .canRollback == true) | .id) // empty
  ' | head -n1)

  if [ -z "$TARGET_ID" ]; then
    echo "Nenhum deployment anterior elegivel para rollback foi encontrado." >&2
    exit 1
  fi
fi

echo "Revertendo para o deployment $TARGET_ID..." >&2

mutation=$(jq -nc --arg id "$TARGET_ID" \
  '{
    query: "mutation DeploymentRollback($id: String!) { deploymentRollback(id: $id) { id } }",
    variables: { id: $id }
  }')

result=$(graphql "$mutation")

if echo "$result" | jq -e '.errors' >/dev/null 2>&1; then
  echo "Rollback falhou: $(echo "$result" | jq -c '.errors')" >&2
  exit 1
fi

echo "Rollback disparado com sucesso para o deployment $TARGET_ID."
echo "$result" | jq -c '.data.deploymentRollback'
