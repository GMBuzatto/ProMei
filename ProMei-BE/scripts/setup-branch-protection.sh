#!/usr/bin/env bash
# Aplica os rulesets de protecao de branch no GitHub (development, staging, main).
#
# ATENCAO: rulesets exigem repositorio PUBLICO ou plano GitHub Pro/Team ou superior.
# Em repositorio privado no plano Free a API responde 403 e nada e aplicado.
# Enquanto isso, o paliativo e o hook local: pnpm hooks:install (.githooks/pre-push).
#
# Pre-requisitos:
#   1. GitHub CLI instalado (https://cli.github.com)
#   2. Autenticado como admin do repositorio: gh auth login
#
# Uso:  ./scripts/setup-branch-protection.sh
#
# Idempotente: se ja existir um ruleset com o mesmo nome, ele e atualizado.

set -euo pipefail

gh_ou_explica() {
  local saida
  if ! saida=$(gh "$@" 2>&1); then
    if echo "$saida" | grep -qE 'Upgrade to GitHub Pro|make this repository public'; then
      cat >&2 <<'MSG'

ERRO: este repositorio e privado e o plano atual nao permite rulesets.

  Opcoes:
    1. Assinar GitHub Pro (mantem o repo privado);
    2. Tornar o repositorio publico;
    3. Usar o gate local por enquanto:  pnpm hooks:install

MSG
      exit 2
    fi
    echo "gh falhou: $saida" >&2
    exit 1
  fi
  printf '%s' "$saida"
}

repo=$(gh_ou_explica repo view --json nameWithOwner --jq '.nameWithOwner')
echo "Repositorio: $repo"

existentes=$(gh_ou_explica api "repos/$repo/rulesets" --jq '.[] | "\(.id) \(.name)"')

for branch in development staging main; do
  arquivo=".github/rulesets/${branch}.json"
  nome="protecao-${branch}"

  id=$(echo "$existentes" | awk -v n="$nome" '$2 == n { print $1 }')

  if [ -n "$id" ]; then
    echo "Atualizando ruleset '$nome' (id $id)..."
    gh_ou_explica api --method PUT "repos/$repo/rulesets/$id" --input "$arquivo" >/dev/null
  else
    echo "Criando ruleset '$nome'..."
    gh_ou_explica api --method POST "repos/$repo/rulesets" --input "$arquivo" >/dev/null
  fi
done

echo
echo "Pronto. Rulesets ativos:"
gh_ou_explica api "repos/$repo/rulesets" --jq '.[] | "  - \(.name) [\(.enforcement)]"'
