# Documentação — ProMei

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
| [16 — Configuração sem Hardcode](16-configuracao-sem-hardcode.md) | Regra: valor pré-configurável vem de env, nunca hardcoded |
| [ADRs](adr/) | Decisões de arquitetura registradas |

## Fase 2 — Cliente + Compras (proposta de design)

| Doc | Conteúdo |
|---|---|
| [17 — Fase 2: visão geral](17-fase-2-visao-geral.md) | Princípios, impactos no MVP, glossário, módulos novos |
| [18 — Clientes](18-clientes.md) | Cadastro, situação financeira, resumo, limite |
| [19 — Vendas](19-vendas.md) | Estrutura, tipos, estados, fluxo transacional |
| [20 — Limite mensal e períodos](20-limite-mensal-e-periodos.md) | Cálculo do limite, janela do período, concorrência |
| [21 — Inadimplência](21-inadimplencia.md) | Vencimento, atraso, bloqueio, regularização |
| [22 — Recebimentos](22-recebimentos.md) | Pagamento parcial/total, saldo, estorno |
| [23 — Estoque nas vendas](23-estoque-e-vendas.md) | Validação, baixa, idempotência, estoque negativo |
| [24 — Liberações administrativas](24-liberacoes-administrativas.md) | Bloqueios, senha administrativa, auditoria |
| [25 — Fechamento mensal](25-fechamento-mensal.md) | Painel consolidado, competência × caixa |
| [26 — Cancelamentos e estornos](26-cancelamentos-e-estornos.md) | Cancelamento, movimentação inversa, devolução |
| [27 — Modelo de dados](27-modelo-de-dados.md) | Tabelas, índices, constraints, ERD, migrações |
| [28 — Contratos de API](28-api-contracts.md) | Endpoints, payloads, erros, regras por rota |
| [29 — Segurança e permissões](29-seguranca-e-permissoes.md) | Isolamento, IDOR, senha, matriz de permissões |
| [30 — Testes](30-testes.md) | Unit, integração, concorrência, segurança, casos extremos |
| [31 — Decisões da fase 2](31-decisoes-pendentes.md) | Registro das 17 decisões tomadas (problema, alternativas, escolha) |
| [32 — Plano de implementação](32-plano-de-implementacao.md) | Épicos, ordem de entrega, riscos |
| [33 — Comprovante de venda](33-comprovante-de-venda.md) | Layout do PDF da venda: blocos, variantes, contrato |

## Decisões já tomadas (ADRs)

- [ADR-0001](adr/0001-backend-nestjs.md) — Back-end: NestJS (Node 22 + TypeScript)
- [ADR-0002](adr/0002-frontend-nextjs.md) — Front-end: Next.js 15 + Tailwind (Vite descartado)
- [ADR-0003](adr/0003-multi-tenancy-postgres.md) — Multi-tenancy: banco único + `company_id` + RLS
- [ADR-0004](adr/0004-multi-repo.md) — Repositórios separados: `ProMei-BE` e `ProMei-FE`
- [ADR-0005](adr/0005-permissions-jwt-with-db-validation.md) — Permissões no JWT com validação em banco
- [ADR-0006](adr/0006-vendas-como-agregado-transacional.md) — Venda como agregado transacional único (fase 2)
- [ADR-0007](adr/0007-rebrand-girofacil.md) — Rebrand de Mahoraga para GiroFácil

## Próximos passos sugeridos

1. Validar visão e escopo (docs 01-02) com os fundadores;
2. Definir paleta de cores da marca (pendência em [07-stack.md](07-stack.md));
3. Criar o monorepo seguindo [08-padroes-de-desenvolvimento.md](08-padroes-de-desenvolvimento.md);
4. Iniciar Épico 1 — Fundação ([14-gestao-do-trabalho.md](14-gestao-do-trabalho.md)).
