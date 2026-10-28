# Documentação — ProMei FE

SaaS multi-tenant de gestão comercial para MEIs: armazém, itens, saídas de estoque com comprovante, evoluindo para NFS-e, pagamentos e gestão de funcionários. Team ProMei opera a plataforma como Super Admin e vende assinaturas mensais/anuais.

## Índice

| Doc | Conteúdo |
|---|---|
| [01 — Visão do Produto](01-visao-do-produto.md) | Problema, usuários, métricas de sucesso |
| [02 — Escopo e MVP](02-escopo-e-mvp.md) | O que entra na v1, o que fica de fora, backlog macro |
| [03 — Requisitos](03-requisitos.md) | Funcionais (RF) e não funcionais (RNF) |
| [04 — Regras de Negócio](04-regras-de-negocio.md) | Regras (RN), estados, tabelas de decisão |
| [05 — Stakeholders](05-stakeholders.md) | Papéis e matriz de decisão |
| [06 — Arquitetura](06-arquitetura.md) | C4, ERD, sequências, multi-tenancy |
| [07 — Stack](07-stack.md) | Tecnologias escolhidas e justificativas |
| [08 — Padrões de Desenvolvimento](08-padroes-de-desenvolvimento.md) | Estrutura, nomenclatura, Git, API |
| [09 — Segurança](09-seguranca.md) | Auth, isolamento, LGPD, threat model |
| [10 — Ambientes](10-ambientes.md) | Dev, staging, produção |
| [11 — Infra e CI/CD](11-infra-ci-cd.md) | Pipeline, Docker, deploy, backup |
| [12 — Estratégia de Testes](12-estrategia-de-testes.md) | Pirâmide, fluxos críticos, gates |
| [13 — Observabilidade](13-observabilidade.md) | Logs, métricas, alertas, auditoria |
| [14 — Gestão do Trabalho](14-gestao-do-trabalho.md) | Épicos, templates, DoR/DoD |
| [15 — Go-Live](15-go-live.md) | Checklist de produção e rollback |
| [16 — Configuração sem Hardcode](16-configuracao-sem-hardcode.md) | Regra: config vem de env, valor visual vem de token do Design System — nunca hardcoded |
| [17 — Camada de Dados](17-camada-de-dados.md) | API client (correlation id, refresh em 401, erros com `code`) e TanStack Query |
| [Configuração de Ambiente](07-configuracao-ambiente.md) | Setup de `.env`, variáveis reconhecidas, validação |
| [ADRs](adr/) | Decisões de arquitetura registradas |
| [Design System](styles/DESIGN-SYSTEM.md) | Tokens, tipografia, espaçamento, componentes, dark mode |
| [Temas por Nicho](styles/temas/README.md) | Paleta por segmento (alimentício, saúde...), mecanismo sem rebuild |
| [Tema Default](styles/temas/default.md) | Primitives, Semantic Tokens, especificação de uso (Figma) |
| [Mockups do Front](mockup-front/) | Propostas de UX/UI e design completo |

## Decisões já tomadas (ADRs)

- [ADR-0001](adr/0001-backend-nestjs.md) — Back-end: NestJS (Node 22 + TypeScript)
- [ADR-0002](adr/0002-frontend-nextjs.md) — Front-end: Next.js 15 + Tailwind (Vite descartado)
- [ADR-0003](adr/0003-multi-tenancy-postgres.md) — Multi-tenancy: banco único + `company_id` + RLS
- [ADR-0004](adr/0004-multi-repo.md) — Repositórios separados: `ProMei-BE` e `ProMei-FE`

## Próximos passos sugeridos

1. Validar visão e escopo (docs 01-02) com os fundadores;
2. ~~Definir paleta de cores da marca~~ — feito: ver [Tema Default](styles/temas/default.md), [Design System](styles/DESIGN-SYSTEM.md) e [Temas por Nicho](styles/temas/README.md), aplicados em [07-stack.md](07-stack.md#paleta-de-cores-e-tema);
3. Criar o monorepo seguindo [08-padroes-de-desenvolvimento.md](08-padroes-de-desenvolvimento.md);
4. Iniciar Épico 1 — Fundação ([14-gestao-do-trabalho.md](14-gestao-do-trabalho.md)).
