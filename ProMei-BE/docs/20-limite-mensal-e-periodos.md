# Limite mensal e período financeiro

> Modelo de dados em [27](27-modelo-de-dados.md) · Casos de borda testados em [30](30-testes.md)

## O que o limite significa

Esta é a definição que governa todo o resto, e ela é contra-intuitiva o bastante para
merecer estar no topo:

> O limite mensal mede **volume de compras a prazo no período**.
> Ele **não** mede saldo devedor.

Consequências diretas, todas exigidas pelo requisito:

- venda à vista **não** consome limite;
- pagar uma venda a prazo **não** devolve limite;
- regularizar inadimplência **não** devolve limite;
- só a virada do período zera o utilizado.

```text
Limite mensal:  R$ 1.000,00
Compra 1 (a prazo):  R$ 300,00   → utilizado 300, disponível 700
Compra 2 (a prazo):  R$ 200,00   → utilizado 500, disponível 500
Compra 3 (a prazo):  R$ 150,00   → utilizado 650, disponível 350
Pagamento de R$ 650,00           → utilizado 650, disponível 350   (não muda)
Compra 4 (à vista):  R$ 400,00   → utilizado 650, disponível 350   (não muda)
```

Se o limite fosse saldo devedor, um cliente poderia pagar e recomprar indefinidamente
dentro do mês — o que é exatamente o comportamento que o negócio quer evitar.

## Fórmula

```text
utilizado(cliente, período) = Σ sales.total
                              WHERE customer_id = cliente
                                AND kind = 'CREDIT'
                                AND status <> 'CANCELED'
                                AND sold_at ∈ [período.start, período.end)

disponível = credit_limit − utilizado          (pode ser negativo)
```

Três detalhes que a fórmula esconde e que precisam estar explícitos:

1. **`status <> 'CANCELED'`**: venda cancelada devolve limite. Ver
   [PD-02](31-decisoes-pendentes.md#pd-02) — é uma decisão, não uma obviedade;
2. **`sold_at`, não `created_at`**: a venda pertence ao momento do fato. Os dois coincidem
   hoje, mas separá-los desde já permite lançamento retroativo sem reescrever a regra;
3. **intervalo semiaberto `[start, end)`**: um instante pertence a exatamente um período.
   Intervalo fechado nos dois lados faz a venda da meia-noite do dia do fechamento contar
   duas vezes.

## Período financeiro

Cada empresa tem um **dia de fechamento** (`closing_day`, 1–31, padrão
`FINANCE_DEFAULT_CLOSING_DAY`). O período vai do **dia seguinte ao fechamento anterior**
até o **dia do fechamento**, inclusive.

```text
closing_day = 15
Período de setembro/2026:  16/08/2026 00:00  →  16/09/2026 00:00  (exclusivo)
                           ou seja: 16/08 até 15/09, 23:59:59.999
```

### Fuso horário

A janela é calculada no **fuso da empresa** (`timezone`, padrão
`FINANCE_DEFAULT_TIMEZONE=America/Sao_Paulo`), e depois convertida para `timestamptz` para
comparar com `sold_at`.

Isso não é preciosismo: uma venda às 21h de 15/09 em São Paulo é 00h de 16/09 em UTC. Com a
janela calculada em UTC, essa venda cairia no período seguinte e o fechamento não bateria
com o caderno do dono. O banco guarda tudo em UTC (`timestamptz`, como já faz o MVP); só o
**corte** é local.

### Dias 29, 30 e 31 — a regra de saturação

`closing_day = 31` não existe em abril. `closing_day = 30` não existe em fevereiro.
`closing_day = 29` não existe em fevereiro de ano não bissexto.

Regra: **satura no último dia do mês**.

```text
closing_day = 31
Jan → 31/01 · Fev/2026 → 28/02 · Fev/2028 → 29/02 · Abr → 30/04

closing_day = 30
Fev/2026 → 28/02 · Mar → 30/03

closing_day = 29
Fev/2026 → 28/02 · Fev/2028 → 29/02
```

E, crucialmente, a **saturação vale para as duas pontas** da janela. Período de março com
`closing_day = 31`:

```text
início = dia seguinte ao fechamento de fevereiro = 01/03
fim    = fechamento de março = 31/03
```

Período de fevereiro com `closing_day = 31`:

```text
início = dia seguinte ao fechamento de janeiro = 01/02
fim    = fechamento de fevereiro = 28/02 (ou 29/02 em bissexto)
```

Note que com `closing_day = 31` o período coincide com o mês civil — que é justamente o
comportamento esperado por quem escolhe "fecho no fim do mês".

### `closing_day = 1` — a borda esquerda

```text
closing_day = 1
Período de setembro:  02/08 → 02/09 (exclusivo), isto é, 02/08 a 01/09
```

Funciona pela regra geral, sem exceção. É um caso de teste obrigatório porque é onde a
implementação ingênua (`mês anterior, mesmo dia`) costuma errar em um dia.

### Função pura

```ts
// finance/period.ts
export interface FinancialPeriod {
  /** Rótulo estável: o ano-mês do FIM do período. Ex.: "2026-09". */
  label: string;
  /** Inclusivo, em UTC. */
  start: Date;
  /** EXCLUSIVO, em UTC. */
  end: Date;
}

export function resolvePeriod(
  reference: Date,        // instante qualquer dentro do período desejado
  closingDay: number,     // 1..31
  timeZone: string,       // ex.: "America/Sao_Paulo"
): FinancialPeriod;

export function previousPeriod(period: FinancialPeriod, closingDay: number, tz: string): FinancialPeriod;
export function nextPeriod(period: FinancialPeriod, closingDay: number, tz: string): FinancialPeriod;
```

Pura, sem banco, sem `Date.now()` interno — a data de referência **sempre** entra por
parâmetro. É o que torna testável "o que acontece em 29/02/2028" sem viajar no tempo.

A biblioteca de datas ainda não está escolhida: `Intl.DateTimeFormat` nativo resolve
conversão de fuso sem dependência nova, mas a aritmética de calendário fica verbosa.
Ver [PD-10](31-decisoes-pendentes.md#pd-10).

<a id="congelamento"></a>
### Congelamento na venda

A venda grava `period_start` e `period_end` no momento em que é criada.

Sem isso, mudar o `closing_day` da empresa reclassificaria retroativamente todas as vendas
passadas: um fechamento já impresso mudaria de valor. Com o congelamento, a mudança de
`closing_day` vale **a partir do próximo período** e o histórico fica intacto — que é
exatamente o "não apague nem sobrescreva dados históricos" do requisito.

O cálculo de "utilizado no período corrente" usa `sold_at ∈ [start, end)` da janela
corrente; as colunas congeladas servem para agrupar histórico e para o fechamento. As duas
formas concordam enquanto `closing_day` não muda — e quando muda, a congelada é a que
conta.

## Virada do período

Não existe rotina de virada. Nada é zerado, nada é escrito.

O utilizado do período novo é `0` porque a soma passa a filtrar por uma janela onde ainda
não há venda. É consequência da fórmula, não de um job — e job de virada seria justamente
o lugar onde um cliente ficaria com limite errado por 24h se a máquina estivesse fora do ar
naquele minuto.

O histórico dos períodos anteriores permanece porque **nada foi apagado**: as vendas
continuam lá, com seu `sold_at`, e qualquer período passado é recomputável.

## Concorrência

Duas vendas a prazo simultâneas do mesmo cliente, cada uma de R$ 600, limite R$ 1.000. Sem
proteção, as duas leem "utilizado = 0", as duas passam, e o cliente compra R$ 1.200.

Estratégia — a mesma já usada pela numeração de comprovantes:

```sql
SELECT pg_advisory_xact_lock(<namespace_credito>, hashtext(<customer_id>));
```

no **início** da transação da venda, antes de qualquer leitura de valor. A segunda venda
espera a primeira comitar e então lê `utilizado = 600` — e é corretamente bloqueada.

Por que advisory lock e não `SELECT ... FOR UPDATE` na linha do cliente:

- travar `customers` serializaria também edições de cadastro, que não têm nada a ver com
  crédito;
- o valor a proteger não está em nenhuma linha (é uma **soma sobre `sales`**), então não há
  linha "certa" para travar; travar uma linha proxy é justamente para isso que o advisory
  lock existe;
- `pg_advisory_xact_lock` é liberado no commit/rollback automaticamente — não há lock
  vazado se a requisição morrer.

O namespace é **constante no código**, não configuração: é identificador, como nome de
tabela. Mudar por ambiente só criaria a chance de dois processos acharem que estão
sincronizados quando não estão. É o mesmo raciocínio já registrado em
`receipts.service.ts`.

`hashtext(uuid)` pode colidir (é 32 bits). Colisão custa serialização desnecessária entre
dois clientes distintos — nunca correção. Aceitável, e documentado aqui para que ninguém
"conserte" isso depois achando que é bug.

### Alternativas avaliadas

| Estratégia | Por que não |
|---|---|
| Contador materializado em `customer_periods` com `UPDATE ... WHERE used + x <= limit` | Atômico e rápido, mas cria uma segunda fonte de verdade que pode divergir das vendas; e o requisito exige que a soma sobre vendas continue sendo a verdade. Fica como otimização futura, com reconciliação |
| `SERIALIZABLE` na transação | Resolve, mas transforma contenção em `40001` (serialization failure) que precisa de retry na aplicação inteira, incluindo o estoque. Custo alto para um único invariante |
| Optimistic locking com versão no cliente | Exige retry no cliente HTTP e não protege a soma, só a linha |

Ver [PD-04](31-decisoes-pendentes.md#pd-04) para quando o contador materializado passa a
valer a pena.

## Limite estourado por liberação

Depois de uma liberação administrativa de crédito, o utilizado **ultrapassa** o limite:

```text
Limite configurado:  R$ 1.000,00
Utilizado:           R$ 1.300,00
Disponível:          −R$ 300,00
```

A liberação **não** altera `credit_limit`. Ela apenas permitiu que **uma** venda passasse
([24](24-liberacoes-administrativas.md)). O cliente segue bloqueado para venda a prazo, e a
próxima exceção exige nova liberação — que é o efeito desejado: cada exceção custa uma
decisão de alguém.

Nenhum `CHECK` no banco impede `utilizado > credit_limit`; a regra é da aplicação e tem
exceção legítima. `CHECK` ali quebraria a liberação.

## Configuração (docs/16 — nada hardcoded)

| Variável | Papel | Padrão sugerido |
|---|---|---|
| `FINANCE_DEFAULT_CLOSING_DAY` | Dia de fechamento de empresa nova | `1` |
| `FINANCE_DEFAULT_TIMEZONE` | Fuso usado no corte do período | `America/Sao_Paulo` |
| `FINANCE_DEFAULT_CREDIT_LIMIT` | Limite de cliente novo | `0` |
| `FINANCE_MAX_CREDIT_LIMIT` | Teto aceito em `PATCH /customers/:id/credit-limit` | `1000000` |
| `FINANCE_DEFAULT_DUE_DAYS` | Prazo padrão quando `dueDate` não é informado | `30` |

`FINANCE_DEFAULT_CREDIT_LIMIT = 0` é escolha de segurança: cliente novo não compra fiado até
alguém decidir que ele pode.

## Regras de negócio

| Regra | Descrição |
|---|---|
| RN-50 | O limite mensal mede volume de compras a prazo no período, não saldo devedor. |
| RN-51 | Venda à vista não consome limite; pagamento e regularização não devolvem limite. |
| RN-52 | O período é `[dia seguinte ao fechamento anterior, dia do fechamento]`, calculado no fuso da empresa. |
| RN-53 | Dia de fechamento maior que o número de dias do mês satura no último dia do mês, nas duas pontas da janela. |
| RN-54 | A janela do período é congelada na venda; mudar `closing_day` vale só a partir do próximo período. |
| RN-55 | A virada de período não executa rotina nenhuma e não apaga nada: o utilizado zera por consequência da janela. |
| RN-56 | Liberação administrativa não altera o limite configurado; o utilizado pode ultrapassá-lo. |
