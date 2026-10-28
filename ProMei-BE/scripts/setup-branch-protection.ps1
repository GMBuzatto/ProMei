# Aplica os rulesets de protecao de branch no GitHub (development, staging, main).
#
# ATENCAO: rulesets exigem repositorio PUBLICO ou plano GitHub Pro/Team ou superior.
# Em repositorio privado no plano Free a API responde 403 e nada e aplicado.
# Enquanto isso, o paliativo e o hook local: pnpm hooks:install (.githooks/pre-push).
#
# Pre-requisitos:
#   1. GitHub CLI instalado: winget install GitHub.cli
#   2. Autenticado como admin do repositorio: gh auth login
#
# Uso:  pwsh ./scripts/setup-branch-protection.ps1
#
# Idempotente: se ja existir um ruleset com o mesmo nome, ele e atualizado.

Set-StrictMode -Version Latest

function Invoke-Gh {
    param([Parameter(ValueFromRemainingArguments = $true)]$GhArgs)

    # stderr vai para arquivo: evita que o PowerShell transforme a saida de erro
    # de um comando nativo em ErrorRecord e aborte antes da checagem do exit code.
    $arquivoErro = [System.IO.Path]::GetTempFileName()
    try {
        $saida = & gh @GhArgs 2> $arquivoErro
        $codigo = $LASTEXITCODE
        $erro = (Get-Content -Path $arquivoErro -Raw -ErrorAction SilentlyContinue)

        if ($codigo -ne 0) {
            if ($erro -match 'Upgrade to GitHub Pro|make this repository public') {
                Write-Host ''
                Write-Host 'ERRO: este repositorio e privado e o plano atual nao permite rulesets.' -ForegroundColor Red
                Write-Host ''
                Write-Host '  Opcoes:' -ForegroundColor Yellow
                Write-Host '    1. Assinar GitHub Pro (mantem o repositorio privado);'
                Write-Host '    2. Tornar o repositorio publico;'
                Write-Host '    3. Usar o gate local por enquanto:  pnpm hooks:install'
                Write-Host ''
                exit 2
            }
            Write-Host "gh falhou (exit $codigo): $erro" -ForegroundColor Red
            exit 1
        }

        return $saida
    }
    finally {
        Remove-Item -Path $arquivoErro -Force -ErrorAction SilentlyContinue
    }
}

$repo = Invoke-Gh repo view --json nameWithOwner --jq '.nameWithOwner'
Write-Host "Repositorio: $repo"

$existentes = @(Invoke-Gh api "repos/$repo/rulesets" --jq '.[] | "\(.id) \(.name)"')

foreach ($branch in @('development', 'staging', 'main')) {
    $arquivo = ".github/rulesets/$branch.json"
    $nome = "protecao-$branch"

    $id = $null
    foreach ($linha in $existentes) {
        $partes = "$linha".Trim() -split '\s+', 2
        if ($partes.Count -eq 2 -and $partes[1] -eq $nome) { $id = $partes[0] }
    }

    if ($id) {
        Write-Host "Atualizando ruleset '$nome' (id $id)..."
        Invoke-Gh api --method PUT "repos/$repo/rulesets/$id" --input $arquivo | Out-Null
    }
    else {
        Write-Host "Criando ruleset '$nome'..."
        Invoke-Gh api --method POST "repos/$repo/rulesets" --input $arquivo | Out-Null
    }
}

Write-Host ''
Write-Host 'Pronto. Rulesets ativos:'
Invoke-Gh api "repos/$repo/rulesets" --jq '.[] | "  - \(.name) [\(.enforcement)]"'
