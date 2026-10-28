# ADR-0004: Repositórios separados para front e back (multi-repo)

- Status: aceita
- Data: 2026-08-01
- Substitui: a estrutura de monorepo descrita originalmente em 08-padroes-de-desenvolvimento.md

## Contexto

A doc inicial propunha monorepo (pnpm workspaces). Decidiu-se separar em `ProMei-BE` e `ProMei-FE`.

## Decisão

Dois repositórios independentes, cada um com README, CI/CD e versionamento próprios.

## Justificativa

- Deploys e pipelines independentes (API e painel evoluem em ritmos diferentes);
- Repositórios menores e mais simples de navegar;
- Permissões de acesso separáveis no futuro.

## Consequências

- Tipos/DTOs compartilhados não podem viver num `packages/shared`: contratos da API viram a fonte de verdade (duplicar schemas zod no FE ou, futuramente, publicar um pacote `@promei/contracts` / gerar tipos via OpenAPI);
- Mudanças que atravessam FE e BE exigem 2 PRs coordenados.
