# Clientes

> Modelo de dados em [27](27-modelo-de-dados.md) · Endpoints em [28](28-api-contracts.md)

## Responsabilidade

O cliente é o **comprador cadastrado de uma empresa**. Ele existe para responder três
perguntas que a venda sozinha não responde:

1. quem comprou;
2. quanto essa pessoa ainda pode comprar a prazo;
3. essa pessoa está em dia?

Tudo o mais (histórico, totais, situação) é **derivado** das vendas e dos recebimentos —
não é digitado nem mantido à mão.

## Vínculo e isolamento

- Cliente pertence a **exatamente uma** empresa (`company_id` obrigatório, `NOT NULL`);
- Não existe cliente global nem cliente compartilhado entre empresas. Duas empresas podem
  ter o mesmo CPF cadastrado, cada uma com seu próprio cliente, limite e histórico;
- `Customer` entra em `TENANT_SCOPED_MODELS`, então toda query via `prisma.db` já sai
  filtrada (ADR-0003), e existe policy de RLS correspondente;
- Usuário de plataforma (Super Admin/Staff) **não** acessa clientes: as rotas de cliente
  são rotas de tenant, e o `PermissionsGuard` devolve 404 para usuário sem `company_id`
  (mesmo comportamento de `/items`).

## Dados cadastrais

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `name` | text | sim | Nome ou razão social |
| `document` | text | não | CPF/CNPJ. Único **por empresa** quando informado (mesmo espírito da RN-20 para SKU) |
| `email` | text | não | |
| `phone` | text | não | |
| `address` | jsonb | não | Endereço em bloco; não há busca por CEP na fase 2 |
| `notes` | text | não | Observação livre |
| `credit_limit` | decimal(12,2) | sim | Padrão vem de env (`FINANCE_DEFAULT_CREDIT_LIMIT`), nunca hardcoded. **Não é aceito no cadastro**: só muda por `PATCH /customers/:id/credit-limit`, com `customer-credit:update` ([PD-16](31-decisoes-pendentes.md#pd-16)) |
| `status` | enum | sim | `ACTIVE` \| `INACTIVE` |
| `financial_status` | enum | sim | `REGULAR` \| `OVERDUE` \| `DELINQUENT` — **derivado**, ver [21](21-inadimplencia.md) |
| `blocked_for_credit` | boolean | sim | Bloqueio **manual** do operador, independente do derivado |
| `anonymized_at` | timestamptz | não | LGPD ([PD-17](31-decisoes-pendentes.md#pd-17)): cliente anonimizado a pedido do titular |

**Documento é opcional de propósito.** O público-alvo é o MEI de balcão: exigir CPF para
cadastrar "Dona Maria da esquina" transformaria o cadastro em obstáculo e empurraria o
usuário para a venda sem cliente — exatamente o que queremos evitar em venda a prazo.
Quando informado, vale a unicidade por empresa.

**Anonimização (LGPD).** Rota própria, `POST /customers/:id/anonymize` (permissão
`customers:delete`, [28](28-api-contracts.md)), separada do `DELETE` porque nunca é exclusão
física — nem quando o cliente não tem venda nenhuma. A pedido do titular, o cadastro é esvaziado — nome vira "Cliente
removido", documento, e-mail, telefone e endereço viram `NULL`, `anonymized_at` é preenchido
e o cliente passa a `INACTIVE`. Vendas, pagamentos e movimentações **permanecem**: a base
legal para reter o registro comercial é distinta da que sustentava o cadastro. A redação
final depende de validação jurídica.

**Cliente inativo** (`status = INACTIVE`) não pode ser usado em venda nova, mas seu
histórico permanece — mesma regra do item (RN-23). Cliente **nunca é excluído** se tiver
venda; a exclusão só é permitida quando não há nenhuma venda vinculada, e nesse caso é
exclusão física mesmo (não há histórico a preservar). A rota de remoção devolve o desfecho
(`DELETED` \| `INACTIVATED`), copiando o contrato já usado em `DELETE /items/:id`.

## Situação financeira

Enum `CustomerFinancialStatus`:

| Valor | Significado | Vende a prazo? | Vende à vista? |
|---|---|---|---|
| `REGULAR` | Sem venda vencida em aberto | Sim, se houver limite | Sim |
| `OVERDUE` | Tem ao menos uma venda vencida em aberto | **Não** | Sim |
| `DELINQUENT` | Tem venda vencida há ≥ `FINANCE_DELINQUENCY_DAYS` (padrão 30) | **Não** | Sim |

A separação entre `OVERDUE` e `DELINQUENT` existe porque as duas coisas são diferentes na
conversa do balcão: "você tem uma conta vencida" ≠ "você está inadimplente". As duas
bloqueiam venda a prazo; só a segunda é rótulo de risco, aparece no fechamento e costuma
disparar cobrança.

O cálculo é uma **função pura**, `customer-status.policy.ts`:

```ts
// entrada: as vendas em aberto do cliente + a data de referência
// saída: REGULAR | OVERDUE | DELINQUENT
export function decideCustomerFinancialStatus(
  openSales: { dueDate: Date; balance: Decimal }[],
  now: Date,
  delinquencyDays: number,
): CustomerFinancialStatus
```

Mesmo formato de `decideAccess` em `src/shared/access/access-policy.ts`: a regra que decide
se alguém compra fiado precisa ser legível e testável sem banco, sem HTTP e sem mocks.

O valor persistido em `customers.financial_status` é **cache materializado** — quem manda é
a função. Ele é recalculado:

- ao confirmar uma venda a prazo;
- ao registrar um recebimento;
- ao cancelar uma venda ou estornar um recebimento;
- pelo job diário de atraso ([21](21-inadimplencia.md#materialização));
- e é **sempre recalculado inline** na validação de uma nova venda a prazo — a validação
  nunca confia no cache (ver [19](19-vendas.md#validação)).

Toda transição gera uma linha em `customer_status_events` (append-only) com estado
anterior, novo, motivo e origem. O bloqueio manual de crédito também escreve ali, com
`reason = MANUAL`: ele não muda a situação derivada (`from` e `to` saem iguais), mas
"desde quando esse cliente está bloqueado, e quem bloqueou" é exatamente o tipo de pergunta
que essa tabela existe para responder — `audit_logs` é trilha genérica e não responde por
cliente. É isso que responde "desde quando esse cliente está
inadimplente" sem varrer o histórico inteiro de vendas.

## Resumo financeiro do cliente

É o bloco que a tela do cliente exibe, e o contrato de
`GET /customers/:id/financial-summary`:

```text
Limite mensal            credit_limit
Valor utilizado          soma das vendas A PRAZO do período corrente (ver doc 20)
Valor disponível         credit_limit - utilizado   (pode ser negativo)
Total de compras         soma de TODAS as vendas não canceladas (à vista + a prazo)
Total pago               soma dos recebimentos + vendas à vista
Total pendente           soma dos saldos em aberto (vencidos ou não)
Total em atraso          soma dos saldos em aberto com vencimento passado
Situação financeira      REGULAR | OVERDUE | DELINQUENT
```

Três decisões embutidas aí, todas deliberadas:

**"Valor utilizado" é do período; "Total de compras/pago/pendente" é vitalício.** Limite é
uma régua mensal; dívida não zera na virada. Misturar as duas escalas no mesmo painel sem
rótulo é a origem clássica de "o sistema disse que eu podia comprar". A API devolve os
campos de período dentro de um objeto `period` com `start`/`end` explícitos, e os
vitalícios fora dele — a UI não precisa adivinhar.

**"Valor disponível" pode ser negativo.** Depois de uma liberação administrativa o
utilizado ultrapassa o limite (é o exemplo do próprio requisito: limite 1.000, utilizado
1.300). A API devolve o número real, negativo, **e** um `availableClamped` nunca menor que
zero, para a UI que preferir mostrar "R$ 0,00 disponível". Esconder o negativo no back-end
apagaria a informação de que houve exceção. Ver [31](31-decisoes-pendentes.md#pd-03).

**Vendas canceladas não entram em nada.** Nem em compras, nem em pendente, nem em
utilizado. Elas continuam visíveis no histórico com status `CANCELED`, e aparecem no
fechamento como linha própria.

### Como o resumo é calculado

Uma consulta agregada por cliente, não N+1:

```sql
-- conceitual; a implementação usa Prisma aggregate/groupBy
SELECT
  SUM(total)                                        FILTER (WHERE status <> 'CANCELED')                    AS total_purchased,
  SUM(total)                                        FILTER (WHERE status <> 'CANCELED' AND kind = 'CREDIT'
                                                              AND sold_at >= :period_start
                                                              AND sold_at <  :period_end)                  AS period_credit_used,
  SUM(total - paid_amount)                          FILTER (WHERE status IN ('PENDING','PARTIALLY_PAID','OVERDUE')) AS total_pending,
  SUM(total - paid_amount)                          FILTER (WHERE status IN ('PENDING','PARTIALLY_PAID','OVERDUE')
                                                              AND due_date < :today)                       AS total_overdue
FROM sales
WHERE company_id = :company AND customer_id = :customer;
```

`sales.paid_amount` é coluna materializada, mantida na mesma transação de cada recebimento
([22](22-recebimentos.md)) — sem ela, todo resumo viraria um join com `payments` e uma
soma por venda.

Índice que sustenta isso: `(company_id, customer_id, status, due_date)` e
`(company_id, customer_id, kind, sold_at)`. Detalhes em [27](27-modelo-de-dados.md).

## Alteração de limite

- Rota dedicada, `PATCH /customers/:id/credit-limit`, separada do `PATCH /customers/:id`, e
  com **permissão própria**: `customer-credit:update` ([PD-16](31-decisoes-pendentes.md#pd-16)).
  Editar cadastro não implica poder dar crédito. A matriz está em
  [29](29-seguranca-e-permissoes.md). Pela mesma razão o limite **não** é aceito no `POST` de
  cadastro: aceitar ali daria crédito a quem só tem `customers:create`;
- A alteração vale **a partir de agora**, para o período corrente inclusive. Não é
  retroativa e não recalcula período fechado: o utilizado do período não muda, só a régua
  contra a qual ele é comparado. Baixar o limite abaixo do já utilizado é permitido e
  simplesmente deixa o disponível negativo — é a forma de "fechar a torneira" sem apagar
  histórico;
- Teto configurável por `FINANCE_MAX_CREDIT_LIMIT` (docs/16), para evitar que um erro de
  digitação vire limite de sete dígitos;
- Toda alteração vai para `audit_logs` com valor anterior e novo, autor, IP e timestamp.
  **Não** existe tabela dedicada de histórico de limite: a trilha append-only já é a fonte
  de verdade dessa pergunta (RNF-06), e criar uma segunda cópia abriria divergência.

## Histórico do cliente

Não há tabela nova para "histórico": ele é a listagem filtrada do que já existe.

| Histórico | Origem |
|---|---|
| Compras | `GET /sales?customerId=` |
| Pagamentos | `GET /payments?customerId=` |
| Situação financeira | `GET /customers/:id/status-events` (`customer_status_events`) |
| Períodos | `GET /customers/:id/financial-summary?period=YYYY-MM` (recalculado sob demanda) |
| Liberações | `GET /sale-authorizations?customerId=` |
| Alterações cadastrais e de limite | `GET /audit-logs?resource=customers` |

"Histórico de períodos" merece nota: períodos anteriores **não** são materializados por
cliente. A janela é determinística (doc [20](20-limite-mensal-e-periodos.md)) e as vendas
têm `sold_at`, então qualquer período passado é recomputável. Materializar por cliente e
por mês criaria uma tabela que cresce com `clientes × meses` e que pode divergir do que as
vendas dizem — e a fase 2 prefere derivar. O que **é** materializado, e por outro motivo, é
o fechamento da empresa ([25](25-fechamento-mensal.md)).

## Regras de negócio (numeração continuando o doc 04)

| Regra | Descrição |
|---|---|
| RN-30 | Cliente pertence a exatamente uma empresa e nunca é visível a outra. |
| RN-31 | `document`, quando informado, é único por empresa. |
| RN-32 | Cliente com venda vinculada não é excluído — apenas inativado. |
| RN-33 | Cliente inativo não pode ser usado em venda nova; o histórico permanece. |
| RN-34 | Situação financeira é derivada das vendas em aberto; o campo persistido é cache e nunca é a autoridade numa validação de venda. |
| RN-35 | Limite mensal é individual por cliente e vale a partir da alteração — nunca retroage. |
| RN-36 | Alteração de limite é sempre auditada com valor anterior e novo, e exige `customer-credit:update`. |
| RN-37 | O número de clientes por empresa respeita `plans.limits.maxCustomers` (RN-14): exceder bloqueia novos cadastros, não apaga existentes. |
| RN-38 | Exclusão a pedido do titular é anonimização; vendas e pagamentos permanecem. |
