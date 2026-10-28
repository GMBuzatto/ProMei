#!/usr/bin/env bash
#
# Teste de fumaça de fluxo — roteiro do docs/15-go-live.md.
#
# O que ele prova, e por que existe separado da ação `.github/actions/smoke-test`:
# aquela faz polling em /health/ready até responder 200, o que só mostra que o
# processo subiu e alcança o banco. Um deploy pode passar nela com a autenticação
# quebrada, o estoque não descontando ou o comprovante não gerando. Este script
# exercita o caminho que o cliente percorre de verdade.
#
# Uso:
#   BASE_URL=https://staging.exemplo/api/v1 \
#   SMOKE_ADMIN_EMAIL=admin@empresa-smoke.exemplo \
#   SMOKE_ADMIN_PASSWORD='...' \
#   scripts/smoke-test.sh
#
# A empresa de smoke é **pré-existente** no ambiente e é reutilizada a cada
# execução: o script não cria nem apaga empresa. Ver "Empresa de smoke" no
# docs/15 — em produção, criar e excluir empresa a cada deploy mexeria em dados
# reais e deixaria rastro na trilha de auditoria a cada release.
#
# Saída: 0 se todos os passos passaram; 1 no primeiro que falhar, com o corpo da
# resposta e o correlation id para investigação.

set -Eeuo pipefail

BASE_URL="${BASE_URL:?defina BASE_URL, ex.: https://staging.exemplo/api/v1}"
SMOKE_ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL:?defina SMOKE_ADMIN_EMAIL}"
SMOKE_ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:?defina SMOKE_ADMIN_PASSWORD}"
CURL_TIMEOUT="${SMOKE_TIMEOUT_SECONDS:-20}"

step_number=0
token=""
item_id=""
receipt_id=""
last_body=""
last_status=""
last_correlation=""

log()  { printf '%s\n' "$*" >&2; }
fail() {
  log ""
  log "FALHOU no passo ${step_number}: $1"
  log "  HTTP           : ${last_status}"
  log "  correlation_id : ${last_correlation:-<ausente>}"
  log "  corpo          : ${last_body}"
  log ""
  log "Pelo docs/15, smoke que falha em qualquer passo é critério de rollback imediato."
  exit 1
}
step() {
  step_number=$((step_number + 1))
  printf '%-2s %s ... ' "${step_number}" "$1" >&2
}
ok() {
  printf 'ok%s\n' "${1:+ ($1)}" >&2
}

# Faz a chamada e popula last_status/last_body/last_correlation.
# request <método> <caminho> [corpo-json] [header-extra]
request() {
  local method="$1" path="$2" body="${3:-}" extra="${4:-}"
  local headers_file response
  headers_file="$(mktemp)"

  local args=(-sS -X "$method" "${BASE_URL}${path}"
    --max-time "$CURL_TIMEOUT" -D "$headers_file" -w '\n%{http_code}')
  [ -n "$token" ] && args+=(-H "authorization: Bearer ${token}")
  [ -n "$extra" ] && args+=(-H "$extra")
  if [ -n "$body" ]; then
    args+=(-H 'content-type: application/json' -d "$body")
  fi

  response="$(curl "${args[@]}" || true)"
  last_status="$(printf '%s' "$response" | tail -n1)"
  last_body="$(printf '%s' "$response" | sed '$d')"
  last_correlation="$(grep -i '^x-correlation-id:' "$headers_file" | tr -d '\r' | cut -d' ' -f2- || true)"
  rm -f "$headers_file"
}

# Lê um campo do JSON sem depender de jq (nem toda imagem de CI tem).
json_field() {
  printf '%s' "$1" | tr -d '\n' | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" |
    head -n1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
}
json_number() {
  printf '%s' "$1" | tr -d '\n' | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*-?[0-9]+" |
    head -n1 | sed -E 's/.*:[[:space:]]*(-?[0-9]+)/\1/'
}

# Campo dentro de um objeto aninhado. Necessário porque a resposta da
# movimentação é `{movement:{id},item:{id},receipt:{id}}` — pegar o primeiro
# "id" do corpo devolveria o id da movimentação, não o do comprovante.
json_nested_field() {
  printf '%s' "$1" | tr -d '\n' | sed -E "s/.*\"$2\"[[:space:]]*:[[:space:]]*\{//" |
    grep -oE "\"$3\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" |
    head -n1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
}

expect_status() {
  [ "$last_status" = "$1" ] || fail "esperava HTTP $1, veio ${last_status}"
}

log "Smoke de fluxo — ${BASE_URL}"
log ""

# ── 1. Liveness ───────────────────────────────────────────────────────────────
step "health"
request GET /health
expect_status 200
ok

# ── 2. Readiness (banco + migrações) ──────────────────────────────────────────
step "health/ready"
request GET /health/ready
expect_status 200
ok

# ── 3. Login do admin da empresa de smoke ─────────────────────────────────────
step "login do admin"
request POST /auth/login \
  "{\"email\":\"${SMOKE_ADMIN_EMAIL}\",\"password\":\"${SMOKE_ADMIN_PASSWORD}\"}"
expect_status 200
token="$(json_field "$last_body" accessToken)"
[ -n "$token" ] || fail "login respondeu 200 mas sem accessToken"
ok

# ── 4. Criar item ─────────────────────────────────────────────────────────────
step "criar item"
request POST /items \
  "{\"name\":\"Smoke $(date +%s)\",\"unit\":\"un\",\"price\":1.5}"
expect_status 201
item_id="$(json_field "$last_body" id)"
[ -n "$item_id" ] || fail "item criado sem id na resposta"
ok "$item_id"

# ── 5. Entrada de estoque ─────────────────────────────────────────────────────
step "entrada de 10"
request POST /stock-movements \
  "{\"itemId\":\"${item_id}\",\"type\":\"IN\",\"quantity\":10,\"reason\":\"smoke test\"}"
expect_status 201
stock_after="$(json_number "$last_body" stock)"
[ "$stock_after" = "10" ] || fail "saldo após entrada deveria ser 10, veio '${stock_after}'"
ok "saldo=10"

# ── 6. Saída de estoque (gera comprovante) ────────────────────────────────────
step "saída de 4"
request POST /stock-movements \
  "{\"itemId\":\"${item_id}\",\"type\":\"OUT\",\"quantity\":4,\"reason\":\"smoke test\"}"
expect_status 201
stock_after="$(json_number "$last_body" stock)"
[ "$stock_after" = "6" ] || fail "saldo após saída deveria ser 6, veio '${stock_after}'"
receipt_id="$(json_nested_field "$last_body" receipt id)"
[ -n "$receipt_id" ] || fail "saída não devolveu comprovante (RF-33)"
ok "saldo=6, comprovante=${receipt_id}"

# ── 7. Saldo insuficiente é recusado ──────────────────────────────────────────
# Sem este passo, um bug que aceitasse estoque negativo passaria despercebido:
# os passos anteriores só provam o caminho feliz.
step "saída acima do saldo é recusada"
request POST /stock-movements \
  "{\"itemId\":\"${item_id}\",\"type\":\"OUT\",\"quantity\":999,\"reason\":\"smoke test\"}"
expect_status 422
case "$last_body" in
  *ESTOQUE_INSUFICIENTE*) ok ;;
  *) fail "esperava código ESTOQUE_INSUFICIENTE" ;;
esac

# ── 8. Comprovante em PDF ─────────────────────────────────────────────────────
# O PDF é gerado depois da resposta: a movimentação devolve o comprovante com
# `pdfStatus: PENDING` e o arquivo chega em seguida. Por isso aqui há espera —
# sem ela, o smoke falharia por corrida, não por defeito.
#
# O corpo é binário e não passa por variável de shell sem corromper (byte nulo),
# então vai direto para arquivo e a verificação é dos bytes mágicos.
step "comprovante em PDF"
pdf_file="$(mktemp)"
pdf_ok=false
for attempt in $(seq 1 "${SMOKE_PDF_ATTEMPTS:-10}"); do
  pdf_status="$(curl -sS -o "$pdf_file" -w '%{http_code}' \
    --max-time "$CURL_TIMEOUT" \
    -H "authorization: Bearer ${token}" \
    "${BASE_URL}/receipts/${receipt_id}/pdf" || true)"

  if [ "$pdf_status" = "200" ] && [ "$(head -c 4 "$pdf_file")" = '%PDF' ]; then
    pdf_ok=true
    break
  fi
  sleep "${SMOKE_PDF_DELAY:-2}"
done

if [ "$pdf_ok" = true ]; then
  ok "$(wc -c <"$pdf_file" | tr -d ' ') bytes, tentativa ${attempt}"
  rm -f "$pdf_file"
else
  last_status="$pdf_status"
  last_body="$(head -c 400 "$pdf_file")"
  rm -f "$pdf_file"
  fail "comprovante ${receipt_id} não virou PDF a tempo"
fi

# ── 9. Trilha de auditoria registrou ──────────────────────────────────────────
step "auditoria registrou a movimentação"
request GET "/audit-logs?action=stock-movement.created&limit=1"
expect_status 200
total="$(json_number "$last_body" total)"
[ -n "$total" ] && [ "$total" -gt 0 ] || fail "auditoria sem registro de movimentação"
ok "total=${total}"

# ── 10. Item volta a inativo (limpeza) ────────────────────────────────────────
# Não apagamos: o item tem movimentações, e movimentação é imutável (RN-22).
# Inativar é a saída prevista pelo próprio domínio.
step "inativar item de smoke"
request PATCH "/items/${item_id}/status" '{"status":"INACTIVE"}'
expect_status 200
ok

log ""
log "Smoke de fluxo OK — ${step_number} passos."
