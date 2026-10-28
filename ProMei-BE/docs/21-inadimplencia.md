# Inadimplência

> Estados da venda em [19](19-vendas.md#estados) · Situação do cliente em [18](18-clientes.md#situação-financeira)

## Linha do tempo

```text
venda a prazo confirmada
        │
        │   status = PENDING
        ▼
   due_date  ────────────────────────────────────────────►
        │
        │   passou do vencimento com saldo > 0
        ▼
   status = OVERDUE            cliente = OVERDUE
        │
        │   + FINANCE_DELINQUENCY_DAYS (padrão 30) de atraso
        ▼
   status = OVERDUE            cliente = DELINQUENT
```

Dois níveis, dois sujeitos diferentes:

- **a venda** fica `OVERDUE` — é um fato sobre aquele título;
- **o cliente** fica `OVERDUE` e depois `DELINQUENT` — é uma classificação de risco
  derivada de **todas** as vendas dele.

Confundir os dois é o erro clássico: um cliente pode ter uma venda vencida e cinco em dia;
ele não é "meio inadimplente", ele é `OVERDUE` até quitar a vencida.

## Definições exatas

Sendo `hoje` a data corrente no **fuso da empresa** e `saldo = total − paid_amount`:

```text
venda em aberto   ⟺  status ∈ {PENDING, PARTIALLY_PAID, OVERDUE}  ∧  saldo > 0
venda vencida     ⟺  em aberto  ∧  due_date < hoje
dias de atraso    =  hoje − due_date         (em dias inteiros, no fuso da empresa)

cliente DELINQUENT ⟺ ∃ venda vencida com dias_de_atraso ≥ FINANCE_DELINQUENCY_DAYS
cliente OVERDUE    ⟺ ∃ venda vencida  ∧  ¬DELINQUENT
cliente REGULAR    ⟺ ¬∃ venda vencida
```

**`due_date < hoje`, estritamente.** No dia do vencimento a venda ainda está `PENDING`: o
cliente tem o dia todo para pagar. Pagar em 15/09 uma conta que vence em 15/09 é pagar em
dia — se o sistema disser o contrário, ele está errado e o cliente tem razão. Isso torna
"pagamento no vencimento" e "pagamento no dia seguinte" dois casos de teste obrigatórios
([30](30-testes.md)).

`due_date` é `DATE` (sem hora): vencimento é um dia, não um instante. Comparação sempre em
dias, no fuso da empresa — nunca subtração de `timestamptz` dividida por 86.400.000.

## Bloqueio para venda a prazo

Um cliente é bloqueado para **venda a prazo** quando:

```text
financial_status ∈ {OVERDUE, DELINQUENT}
   ou
blocked_for_credit = true        (bloqueio manual do operador)
   ou
disponível < valor da venda      (limite — doc 20)
```

Venda **à vista continua liberada** em todos esses casos. As únicas coisas que impedem
venda à vista são cadastro inválido (cliente inativo, item inativo) e estoque — e, no nível
da empresa, a tabela de decisão de acesso do MVP (empresa suspensa/inadimplente não escreve,
docs/04).

Cada bloqueio é reportado separadamente e todos de uma vez ([19](19-vendas.md#validação)):
um cliente pode estar simultaneamente sem limite **e** inadimplente **e** com estoque
insuficiente, e o operador precisa ver os três antes de decidir pedir liberação.

## Regularização

Quando o último título vencido é quitado, o sistema **recalcula** a situação do cliente na
mesma transação do recebimento:

```text
recebimento registrado
        │
        ├── UPDATE sales.paid_amount, sales.status
        ├── recalcula situação do cliente a partir das vendas em aberto
        ├── se mudou: UPDATE customers.financial_status
        └── se mudou: INSERT customer_status_events (from, to, reason = 'PAYMENT')
```

A regularização:

- devolve a possibilidade de comprar a prazo (se houver limite disponível);
- **não** devolve limite utilizado (RN-51);
- **não** apaga o histórico: `customer_status_events` guarda que o cliente esteve
  `DELINQUENT` de tal data a tal data, e as vendas guardam que foram pagas com atraso.

Quitação parcial de um título vencido **não** regulariza: enquanto `saldo > 0` e
`due_date < hoje`, a venda segue vencida. Um recebimento parcial move a venda de `OVERDUE`
para… `OVERDUE` (o status derivado do tempo vence o derivado do valor). A tabela de decisão
está abaixo.

## Estado da venda: tabela de decisão

`sale-status.policy.ts`, função pura, sem banco:

| `paid_amount` | vencida? | cancelada? | status |
|---|---|---|---|
| — | — | sim | `CANCELED` |
| `= total` | — | não | `PAID` |
| `0 < pago < total` | não | não | `PARTIALLY_PAID` |
| `0 < pago < total` | sim | não | `OVERDUE` |
| `0` | não | não | `PENDING` |
| `0` | sim | não | `OVERDUE` |

`PAID` vence o vencimento: uma venda quitada com atraso é `PAID`, e o atraso passado fica
registrado nos recebimentos (data do pagamento > `due_date`), não no status. `CANCELED`
vence tudo.

## Materialização

`OVERDUE` é o único estado que depende do **relógio**, não de uma ação do usuário. Ninguém
faz uma requisição no instante em que uma venda vence.

Estratégia em duas camadas:

**1. Derivação na leitura é a autoridade.** Toda consulta que precisa saber se algo está
vencido compara `due_date < hoje` diretamente, sem depender do valor persistido. Isso vale
para: validação de venda a prazo, resumo financeiro do cliente, painel de fechamento. É o
que garante que o sistema esteja correto **no primeiro milissegundo** do dia do atraso,
mesmo que nenhum job tenha rodado.

**2. Materialização por job diário, para listagem e filtro.** Um cron in-process
(`@nestjs/schedule`, dependência nova pequena — [07](07-stack.md) descarta fila, não
agendador) roda uma vez por dia, por empresa, no horário configurado
(`FINANCE_OVERDUE_JOB_CRON`) e:

```sql
UPDATE sales SET status = 'OVERDUE'
 WHERE company_id = :company
   AND status IN ('PENDING', 'PARTIALLY_PAID')
   AND due_date < :today_in_company_tz
   AND total > paid_amount;
```

seguido do recálculo de `customers.financial_status` dos clientes afetados, com
`customer_status_events` para cada transição.

Duas travas necessárias:

- **múltiplas réplicas**: a API é stateless e escalável horizontalmente (docs/06), então o
  job rodaria N vezes. Protegido por `pg_advisory_lock` de namespace próprio — quem não
  pegar o lock desiste silenciosamente. Sem Redis, sem eleição de líder;
- **idempotência**: o `UPDATE` é idempotente por construção (filtra por status e saldo), e
  o `INSERT` em `customer_status_events` só ocorre quando o estado realmente muda.

O job é **conveniência, não correção**. Se ele não rodar por três dias, nenhuma decisão de
crédito fica errada — só as listagens filtradas por "em atraso" ficam desatualizadas. Essa
propriedade é o que permite não ter fila.

Ver [PD-05](31-decisoes-pendentes.md#pd-05) para a alternativa "status sempre derivado, sem
job".

## Configuração

| Variável | Papel | Padrão sugerido |
|---|---|---|
| `FINANCE_DELINQUENCY_DAYS` | Dias de atraso para `DELINQUENT` | `30` |
| `FINANCE_OVERDUE_JOB_CRON` | Quando o job diário roda | `0 3 * * *` |
| `FINANCE_OVERDUE_JOB_ENABLED` | Desliga o job (útil em teste e em réplica dedicada) | `true` |

O prazo de 30 dias é **regra de negócio configurável**, exatamente como as 5 tentativas de
login do RF-03: o requisito fixa o padrão, o env permite ajustar sem deploy (docs/16).

## Regras de negócio

| Regra | Descrição |
|---|---|
| RN-60 | Toda venda a prazo tem vencimento; sem vencimento não existe venda a prazo. |
| RN-61 | Uma venda está vencida quando `due_date < hoje` e ainda há saldo. No dia do vencimento ela **não** está vencida. |
| RN-62 | Cliente com ao menos uma venda vencida é `OVERDUE`; com atraso ≥ `FINANCE_DELINQUENCY_DAYS` é `DELINQUENT`. |
| RN-63 | Cliente `OVERDUE`, `DELINQUENT` ou bloqueado manualmente não compra a prazo, mas continua comprando à vista. |
| RN-64 | Quitar todos os títulos vencidos regulariza o cliente na mesma transação do recebimento, sem devolver limite. |
| RN-65 | Quitação parcial de título vencido não regulariza. |
| RN-66 | Toda transição de situação financeira gera evento append-only com estado anterior, novo e motivo. |
| RN-67 | Nenhuma decisão de crédito depende do job de atraso ter rodado. |
