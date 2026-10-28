# Fase 2 — Cliente + Compras: visão geral

> **Status:** proposta de design. Nenhuma linha de código foi escrita a partir deste
> documento ainda. O plano de execução está em
> [32-plano-de-implementacao.md](32-plano-de-implementacao.md) e as decisões que ainda
> dependem do negócio estão em [31-decisoes-pendentes.md](31-decisoes-pendentes.md).

## O que esta fase adiciona

O MVP entregou **catálogo e armazém**: item, saldo, movimentação, comprovante. O que ele
não tem é **para quem** a mercadoria saiu e **se aquilo foi pago**. Hoje uma saída de
estoque é um fato físico sem contraparte financeira.

A fase 2 fecha esse par: introduz **cliente**, **venda** (com itens, à vista ou a prazo),
**recebimento**, **limite mensal de crédito**, **inadimplência**, **liberação
administrativa** e **fechamento do período**.

## Princípio central: a venda passa a ser o fato de negócio

No MVP, quem registra a realidade é a `StockMovement`. A partir da fase 2:

```text
Venda  →  é o fato de negócio (o que foi combinado com o cliente)
Movimentação de estoque  →  é a consequência física da venda
Recebimento  →  é a consequência financeira da venda
```

A movimentação **não deixa de existir nem muda de significado** — ela continua sendo o
histórico append-only que sustenta a RN-22 e reconstrói o saldo. O que muda é que ela
passa a ter, opcionalmente, uma **origem**: ou foi lançada à mão (como hoje), ou nasceu de
uma venda.

Essa é a razão de a fase 2 ser evolução e não sistema paralelo: nenhum conceito do MVP é
substituído, todos ganham uma origem a mais.

## Mapa dos documentos desta fase

| Doc | Conteúdo |
|---|---|
| [17 — Visão geral](17-fase-2-visao-geral.md) | Este documento: princípios, impactos no MVP, glossário |
| [18 — Clientes](18-clientes.md) | Cadastro, situação financeira, resumo financeiro |
| [19 — Vendas](19-vendas.md) | Estrutura, tipos, estados, fluxo de confirmação |
| [20 — Limite mensal e períodos](20-limite-mensal-e-periodos.md) | Cálculo do limite, período financeiro, virada |
| [21 — Inadimplência](21-inadimplencia.md) | Vencimento, atraso, bloqueio, regularização |
| [22 — Recebimentos](22-recebimentos.md) | Pagamento parcial/total, saldo, estorno |
| [23 — Estoque nas vendas](23-estoque-e-vendas.md) | Validação, baixa, idempotência, estoque negativo |
| [24 — Liberações administrativas](24-liberacoes-administrativas.md) | Bloqueios, senha administrativa, auditoria |
| [25 — Fechamento mensal](25-fechamento-mensal.md) | Painel consolidado, competência × caixa |
| [26 — Cancelamentos e estornos](26-cancelamentos-e-estornos.md) | Cancelamento, movimentação inversa, devolução |
| [27 — Modelo de dados](27-modelo-de-dados.md) | Tabelas, campos, índices, constraints, ERD |
| [28 — Contratos de API](28-api-contracts.md) | Endpoints, payloads, erros, regras por rota |
| [29 — Segurança e permissões](29-seguranca-e-permissoes.md) | Isolamento, IDOR, senha administrativa, matriz |
| [30 — Testes](30-testes.md) | Unit, integração, concorrência, segurança, casos extremos |
| [31 — Decisões da fase 2](31-decisoes-pendentes.md) | Registro das 17 decisões tomadas |
| [32 — Plano de implementação](32-plano-de-implementacao.md) | Ordem de entrega, épicos, migrações |
| [33 — Comprovante de venda](33-comprovante-de-venda.md) | Layout do PDF da venda |
| [ADR-0006](adr/0006-vendas-como-agregado-transacional.md) | Venda como agregado transacional único |

> **Nota sobre a numeração:** a sugestão original desta feature usava os números `09` a
> `23`, que já estão ocupados por `09-seguranca.md` … `16-configuracao-sem-hardcode.md`.
> A sequência continua a partir de `17` para não colidir com a documentação existente e
> para manter a ordem de leitura cronológica do projeto.

## Glossário (usar estes termos em código, API e UI)

| Termo pt-BR (UI/docs) | Identificador (código/banco/API) | Significado |
|---|---|---|
| Cliente | `Customer` / `customers` | Comprador cadastrado, pertencente a uma empresa |
| Venda | `Sale` / `sales` | Fato de negócio: itens + condição de pagamento |
| Item da venda | `SaleItem` / `sale_items` | Linha da venda: produto, quantidade, valor |
| Recebimento / pagamento | `Payment` / `payments` | Valor recebido contra uma venda |
| Venda à vista | `SaleKind.CASH` | Quitada no ato; não usa limite |
| Venda a prazo | `SaleKind.CREDIT` | Gera pendência; consome limite |
| Limite mensal | `credit_limit` | Teto de compras a prazo por período |
| Período financeiro | `period` | Janela entre dois fechamentos da empresa |
| Fechamento | `closing_day` | Dia que encerra o período |
| Liberação administrativa | `SaleAuthorization` / `sale_authorizations` | Exceção de **crédito**, pontual, para **uma** venda |
| Situação financeira | `CustomerFinancialStatus` | `REGULAR` \| `OVERDUE` \| `DELINQUENT` |
| Inadimplente | `DELINQUENT` | Atraso ≥ N dias (padrão 30) |

Convenção mantida do MVP ([08](08-padroes-de-desenvolvimento.md)): **identificadores em
inglês, UI e documentação em pt-BR**. Enums de banco em inglês maiúsculo (como
`CompanyStatus`); códigos de erro de negócio em português maiúsculo (como
`ESTOQUE_INSUFICIENTE`). Os dois padrões já convivem no MVP e continuam convivendo.

## Impactos no que já existe

Levantamento honesto do que a fase 2 **toca** no MVP. Nada aqui é reescrita; são pontos de
extensão, e cada um tem seu tratamento detalhado no documento indicado.

| Artefato do MVP | Impacto | Onde está detalhado |
|---|---|---|
| `stock_movements` | Ganha `sale_id`, `sale_item_id` e `origin`; `reason` passa a ser preenchido pelo sistema em movimentação de venda | [23](23-estoque-e-vendas.md), [27](27-modelo-de-dados.md) |
| `receipts` | Ganha `sale_id`; hoje o comprovante é 1:1 com movimentação, e uma venda de N itens geraria N comprovantes — passa a ser 1 comprovante por venda | [23](23-estoque-e-vendas.md) |
| RN-21 ("estoque nunca fica negativo") | Inconsistência levantada e **resolvida a favor da regra**: não há estoque negativo nem liberação de estoque. A fase 2 ainda reforça com `CHECK (stock >= 0)` | [31](31-decisoes-pendentes.md#pd-01), [23](23-estoque-e-vendas.md#estoque-negativo) |
| `TENANT_SCOPED_MODELS` | Precisa receber os 6 models novos; a lista é explícita de propósito (ADR-0003) e o teste de isolamento cobra | [27](27-modelo-de-dados.md), [29](29-seguranca-e-permissoes.md) |
| Políticas de RLS | Uma policy por tabela nova, no mesmo padrão da migração `20260808120000` | [27](27-modelo-de-dados.md) |
| `PERMISSION_RESOURCES` | Ganha `customers`, `customer-credit`, `sales`, `payments`, `credit-authorizations`, `closings`, `finance-settings` | [29](29-seguranca-e-permissoes.md) |
| `default-company-roles.ts` | Admin e Colaborador ganham os pares novos; empresa criada por seed e por API precisam continuar idênticas | [29](29-seguranca-e-permissoes.md) |
| `BusinessErrorCode` | Ganha os códigos de bloqueio de venda e de crédito | [28](28-api-contracts.md) |
| `plans.limits` (JSONB) | Pode ganhar `maxCustomers`, seguindo RN-14 | [31](31-decisoes-pendentes.md#pd-08) |
| `companies` | **Não** ganha colunas. Configuração financeira vai para tabela 1:1 dedicada | [27](27-modelo-de-dados.md) |
| `.env.example` | Ganha as variáveis da fase 2 (docs/16: nada hardcoded) | [27](27-modelo-de-dados.md#configuração) |

## Módulos NestJS novos

Seguindo a estrutura por domínio de [08](08-padroes-de-desenvolvimento.md):

```text
src/modules/
├── customers/            # cadastro, resumo financeiro, limite
│   ├── customers.controller.ts
│   ├── customers.service.ts
│   ├── customer-financial.service.ts   # resumo e situação (leitura)
│   ├── customer-status.policy.ts       # função pura: situação financeira
│   └── dto/
├── sales/                # venda: criação transacional, listagem, cancelamento
│   ├── sales.controller.ts
│   ├── sales.service.ts
│   ├── sale-validation.service.ts      # coleta de bloqueios
│   ├── sale-totals.ts                  # função pura: totais e arredondamento
│   ├── sale-status.policy.ts           # função pura: estado financeiro da venda
│   └── dto/
├── payments/             # recebimentos e estornos
├── authorizations/       # senha administrativa + trilha de liberações
├── finance/              # período financeiro e painel de fechamento
│   ├── period.ts                       # função pura: janela do período
│   ├── closings.controller.ts
│   └── closings.service.ts
└── (existentes: auth, companies, items, inventory, receipts, audit, ...)
```

**Onde cada regra vive** — a resposta longa está em
[19](19-vendas.md#onde-cada-regra-vive), mas o resumo é:

- **funções puras** (`sale-totals.ts`, `period.ts`, `customer-status.policy.ts`,
  `sale-status.policy.ts`): aritmética e classificação, testáveis sem banco — mesmo padrão
  de `src/shared/access/access-policy.ts` e `src/modules/items/sku.ts`;
- **services**: orquestração, transação, locks, auditoria;
- **controllers**: HTTP, permissão declarada, escopo vindo do JWT;
- **DTOs**: forma do payload e validação sintática;
- **banco**: as invariantes que não podem depender de código correto (unicidade,
  `CHECK`, FK).

Nenhuma regra de negócio em controller, DTO ou repositório.

## Fronteiras que esta fase NÃO cruza

Escopo é o que fica de fora tanto quanto o que entra:

- **sem NFS-e**: a venda continua gerando o comprovante sem valor fiscal da RN-24;
- **sem gateway de pagamento**: recebimento é registro manual, como a cobrança de
  assinatura do MVP;
- **sem fila/Redis** ([07](07-stack.md)): tudo que precisa acontecer, acontece na
  requisição ou em cron in-process;
- **sem parcelamento** (uma venda a prazo tem **um** vencimento — carnê fica para fase 3;
  ver [31](31-decisoes-pendentes.md#pd-09));
- **sem estoque negativo e sem liberação de estoque** ([PD-01](31-decisoes-pendentes.md#pd-01));
- **sem quantidade fracionária** ([PD-07](31-decisoes-pendentes.md#pd-07));
- **sem fechamento formal com snapshot** ([PD-14](31-decisoes-pendentes.md#pd-14));
- **sem devolução parcial de mercadoria** (cancelamento é total; ver
  [26](26-cancelamentos-e-estornos.md)).
