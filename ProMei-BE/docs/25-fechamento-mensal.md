# Fechamento mensal

> Período em [20](20-limite-mensal-e-periodos.md) · Pagamento fora do período em [22](22-recebimentos.md#pagamento-após-o-fechamento-do-período)

## O que o painel é

Uma **consolidação calculada sob demanda** para um período. Não é um processo que precisa
ser executado, não trava nada e não impede lançamentos.

```text
GET /closings/summary?period=2026-09
GET /closings/summary?from=2026-08-16&to=2026-09-15
```

Sem parâmetro, devolve o **período corrente**.

Por que calculado e não materializado, como padrão: um fechamento materializado precisa ser
executado, e "o fechamento de setembro não rodou porque o servidor estava fora do ar"
transforma um relatório em incidente. Materialização existe, mas como **ato explícito** e
opcional e fica para a fase 2.1 — ver [Fechamento formal](#fechamento-formal-fase-21) abaixo.

## Competência e caixa

O painel tem dois blocos, com rótulo, porque respondem perguntas diferentes:

| Bloco | Filtro | Pergunta |
|---|---|---|
| **Vendas do período** (competência) | `sales.sold_at ∈ [start, end)` | Quanto vendi? |
| **Recebimentos do período** (caixa) | `payments.paid_at ∈ [start, end)`, não estornados | Quanto entrou? |

Os dois **não fecham entre si**, e não devem fechar: uma venda a prazo de setembro é
recebida em outubro; um título de julho é recebido em setembro. Forçar os números a bater
exigiria mover a venda de período — que é exatamente o que o requisito proíbe.

Para tornar a diferença legível em vez de misteriosa, o bloco de caixa é **quebrado por
origem**:

```text
Recebido no período                       R$ 8.400,00
  ├── de vendas deste período             R$ 6.100,00
  └── de vendas de períodos anteriores    R$ 2.300,00
```

E o bloco de competência mostra o destino do que foi vendido:

```text
Vendido no período                        R$ 12.000,00
  ├── à vista (recebido no ato)           R$  5.000,00
  ├── a prazo já recebido                 R$  1.100,00
  └── a prazo em aberto                   R$  5.900,00
```

Com esses dois desdobramentos, "por que recebi 8.400 se vendi 12.000" tem resposta na
própria tela.

## Conteúdo do painel

### Totais do período

| Indicador | Definição |
|---|---|
| Total vendido | `Σ sales.total`, `status ≠ CANCELED`, `sold_at ∈ período` |
| Quantidade de vendas | `COUNT(*)` sob o mesmo filtro |
| Total à vista | idem, `kind = CASH` |
| Total a prazo | idem, `kind = CREDIT` |
| Ticket médio | `total vendido ÷ quantidade` (0 quando não há venda) |
| Total cancelado | `Σ total`, `status = CANCELED`, `sold_at ∈ período` |
| Quantidade de cancelamentos | `COUNT(*)` sob o mesmo filtro |

### Caixa do período

| Indicador | Definição |
|---|---|
| Total recebido | `Σ payments.amount`, `reversed_at IS NULL`, `paid_at ∈ período` |
| … de vendas do período | idem, com `sale.sold_at ∈ período` |
| … de períodos anteriores | idem, com `sale.sold_at < período.start` |
| Total estornado | `Σ amount`, `reversed_at ∈ período` |
| Recebido por forma de pagamento | `GROUP BY payments.method` |

### Posição em aberto (foto de agora, não do período)

| Indicador | Definição |
|---|---|
| Total pendente | `Σ (total − paid_amount)` das vendas em aberto |
| Total em atraso | idem, com `due_date < hoje` |
| Total inadimplente | idem, com `due_date < hoje − FINANCE_DELINQUENCY_DAYS` |
| Clientes inadimplentes | `COUNT(DISTINCT customer_id)` sob o filtro acima |

Estes três **não** são filtrados por período, e o painel precisa dizer isso na tela.
"Total em atraso" é a dívida vencida **hoje**, venha de que período vier — perguntar
"quanto estava em atraso em setembro" é outra pergunta, que exigiria histórico de saldos
que a fase 2 não mantém.

### Liberações administrativas

| Indicador | Definição |
|---|---|
| Total liberado administrativamente | `Σ sale_authorizations.sale_total` (**distinto por venda**) |
| Quantidade de vendas liberadas | `COUNT(DISTINCT sale_id)` |
| Liberações por motivo | `COUNT(*) GROUP BY block_reason` — limite, débito vencido, inadimplência |
| Vendas liberadas para cliente inadimplente | `COUNT(DISTINCT sale_id)`, `block_reason = CUSTOMER_DELINQUENT` |
| Vendas liberadas e canceladas depois | `COUNT(DISTINCT sale_id)` com `sales.status = CANCELED` |

**`DISTINCT sale_id` é obrigatório** e é a armadilha deste painel: uma venda liberada por
limite *e* por inadimplência tem duas linhas em `sale_authorizations`. Somar `sale_total` sem
distinct conta a venda duas vezes e o número do painel fica maior que o total vendido — o
tipo de erro que só é descoberto quando alguém confere no braço. Está na lista de testes
obrigatórios ([30](30-testes.md)).

Não existe linha de "vendas liberadas por estoque" nem de "vendas com estoque negativo": a
RN-21 foi mantida absoluta ([PD-01](31-decisoes-pendentes.md#pd-01)) e só há liberação de
crédito.

A última linha existe por um motivo específico: cancelar uma venda liberada é a forma de
fazer a exceção sumir do total vendido. Ela não some da contagem de liberações — e o dono
precisa ver se esse número está crescendo.

### Por cliente

```text
GET /closings/by-customer?period=2026-09&page=1&limit=20
```

Paginado, ordenável por total vendido ou por pendente. Por cliente:

```text
cliente · total comprado no período · à vista · a prazo · recebido no período
        · pendente (atual) · em atraso (atual) · situação financeira
```

Vendas **sem cliente** aparecem consolidadas numa linha própria, rotulada
("Consumidor não identificado"), nunca omitidas — senão a soma da tabela não bate com o
total do painel.

<a id="fechamento-formal-fase-21"></a>
## Fechamento formal (fase 2.1)

> **Fora do escopo da fase 2**, por decisão em
> [PD-14](31-decisoes-pendentes.md#pd-14): o painel calculado atende ao requisito, e o
> snapshot entra depois, com o painel já validado contra dados reais. A seção fica registrada
> para não ser redesenhada do zero.

Além do painel calculado, existe a possibilidade de **encerrar formalmente** um período:

```text
POST /closings   { period: "2026-09" }
```

Isso grava uma linha em `period_closures` com o snapshot de todos os indicadores, o autor e
o timestamp. Serve para: comparar o que o sistema dizia no dia do fechamento com o que ele
diz hoje, e dar ao dono a sensação de "mês fechado".

O que o fechamento formal **não** faz, e isso precisa estar claro:

- **não bloqueia lançamentos** no período fechado. Um recebimento de um título antigo
  continua sendo aceito, com `paid_at` real. Bloquear seria proibir o operador de registrar
  um fato que aconteceu;
- **não congela os números do painel**: o painel continua calculando. O snapshot é
  comparável, não substituto;
- **não é pré-requisito** para nada. O período seguinte começa sozinho, pela data.

Um período pode ser fechado uma vez só (`@@unique([companyId, periodLabel])`). Refazer o
snapshot é um novo `POST` que substitui? Não — gera erro. Se o número mudou, isso é
informação, e o caminho é ver o painel atual ao lado do snapshot.

Ver [PD-14](31-decisoes-pendentes.md#pd-14): fechamento formal é escopo da fase 2 ou 2.1.

## Performance

Todos os indicadores saem de **agregações com filtro**, não de varredura em aplicação.
Índices que sustentam o painel (detalhe em [27](27-modelo-de-dados.md)):

```text
sales    (company_id, sold_at)                  → blocos de competência
sales    (company_id, status, due_date)         → posição em aberto
sales    (company_id, customer_id, sold_at)     → por cliente
payments (company_id, paid_at)                  → bloco de caixa
sale_authorizations (company_id, authorized_at) → liberações
```

O painel é **uma requisição, poucas queries agregadas** — não uma query por indicador. Com
até 100 empresas ativas e o alvo de p95 < 500 ms (RNF-03), isso é confortável. Se um dia
não for, o caminho é materialização incremental, não índice mágico.

## Regras de negócio

| Regra | Descrição |
|---|---|
| RN-100 | O painel de fechamento é calculado sob demanda; nenhum processo precisa ser executado para ele existir. |
| RN-101 | A venda pertence ao período do `sold_at`; o recebimento, ao período do `paid_at`. Nenhum dos dois é reclassificado. |
| RN-102 | O painel separa competência e caixa, e desdobra o caixa por origem (deste período × anteriores). |
| RN-103 | Pendente, em atraso e inadimplente são posições atuais, não do período, e são rotulados como tal. |
| RN-104 | Totais de liberação contam vendas distintas, nunca linhas de autorização. |
| RN-105 | Vendas sem cliente aparecem consolidadas no relatório por cliente, nunca omitidas. |
| RN-106 | *(fase 2.1)* Fechar formalmente um período grava um snapshot e não bloqueia lançamentos posteriores. |
