# Rollback de deploy no Railway: reverte o servico (staging ou producao) para
# o deployment anterior bem-sucedido, via API GraphQL publica do Railway
# (docs/11-infra-ci-cd.md: "Rollback: redeploy da imagem anterior").
#
# Uso:
#   $env:RAILWAY_TOKEN = "..."
#   $env:RAILWAY_PROJECT_ID = "..."
#   $env:RAILWAY_SERVICE_ID = "..."
#   $env:RAILWAY_ENVIRONMENT_ID = "..."
#   .\scripts\rollback.ps1 [-To <deployment_id>]
#
# Sem -To, busca os deployments recentes do servico e reverte para o primeiro
# anterior ao atual com status SUCCESS e canRollback=$true.
#
# IDs de projeto/servico/ambiente: `railway status --json` (com o diretorio
# linkado via `railway link`) ou na URL do dashboard do Railway.
param(
    [string]$To
)

$ErrorActionPreference = 'Stop'

foreach ($name in 'RAILWAY_TOKEN', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID', 'RAILWAY_ENVIRONMENT_ID') {
    if (-not (Test-Path "env:$name")) {
        Write-Error "$name nao definido"
        exit 1
    }
}

$apiUrl = 'https://backboard.railway.com/graphql/v2'
$headers = @{
    'Project-Access-Token' = $env:RAILWAY_TOKEN
    'Content-Type'         = 'application/json'
}

function Invoke-RailwayGraphQL {
    param($Body)
    Invoke-RestMethod -Method Post -Uri $apiUrl -Headers $headers -Body ($Body | ConvertTo-Json -Depth 10)
}

$targetId = $To

if (-not $targetId) {
    Write-Host 'Buscando deployments recentes do servico...'

    $query = @{
        query     = 'query Deployments($projectId: String!, $serviceId: String!, $environmentId: String!) { deployments(input: { projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId }, first: 10) { edges { node { id status canRollback createdAt } } } }'
        variables = @{
            projectId     = $env:RAILWAY_PROJECT_ID
            serviceId     = $env:RAILWAY_SERVICE_ID
            environmentId = $env:RAILWAY_ENVIRONMENT_ID
        }
    }
    $response = Invoke-RailwayGraphQL -Body $query

    if ($response.errors) {
        Write-Error "Erro na API do Railway: $($response.errors | ConvertTo-Json -Compress)"
        exit 1
    }

    $deployments = @($response.data.deployments.edges | ForEach-Object { $_.node })
    $candidate = $deployments | Select-Object -Skip 1 | Where-Object { $_.status -eq 'SUCCESS' -and $_.canRollback } | Select-Object -First 1

    if (-not $candidate) {
        Write-Error 'Nenhum deployment anterior elegivel para rollback foi encontrado.'
        exit 1
    }
    $targetId = $candidate.id
}

Write-Host "Revertendo para o deployment $targetId..."

$mutation = @{
    query     = 'mutation DeploymentRollback($id: String!) { deploymentRollback(id: $id) { id } }'
    variables = @{ id = $targetId }
}
$result = Invoke-RailwayGraphQL -Body $mutation

if ($result.errors) {
    Write-Error "Rollback falhou: $($result.errors | ConvertTo-Json -Compress)"
    exit 1
}

Write-Host "Rollback disparado com sucesso para o deployment $targetId."
$result.data.deploymentRollback | ConvertTo-Json -Compress
