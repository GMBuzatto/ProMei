# Estratégia de testes — fase 2

> Base: [12](12-estrategia-de-testes.md). Ferramentas e gates são os mesmos; o que segue é
> o **conteúdo** a testar.

## Princípio

O que a fase 2 acrescenta é dinheiro e concorrência. Os dois falham em silêncio: um estoque
errado alguém percebe ao contar a prateleira; um centavo errado no limite de crédito só
aparece na discussão com o cliente, meses depois.

Por isso a pirâmide se apoia mais embaixo do que no MVP: toda regra financeira é **função
pura testada exaustivamente**, e a integração verifica que ela foi chamada no lugar certo,
dentro da transação certa.

## Unitários — funções puras

Sem banco, sem mock, sem HTTP. Se um teste desta seção precisar de mock, a regra está no
lugar errado.

### `finance/period.ts` — janela do período

O maior gerador de bug desta fase. Casos obrigatórios:

| Caso | Entrada | Esperado |
|---|---|---|
| Fechamento no meio do mês | dia 15, ref. 02/09 | 16/08 → 16/09 (exclusivo) |
| Fechamento dia 1 | dia 1, ref. 15/09 | 02/09 → 02/10 |
| Fechamento dia 1, ref. no próprio dia 1 | dia 1, ref. 01/09 | 02/08 → 02/09 |
| Fechamento dia 28 | dia 28, ref. 10/03 | 01/03 → 29/03 |
| Fechamento dia 29, fev. comum | dia 29, ref. 10/02/2026 | 30/01 → 01/03 (fev satura em 28) |
| Fechamento dia 29, bissexto | dia 29, ref. 10/02/2028 | 30/01 → 01/03 (fev satura em 29) |
| Fechamento dia 30, fevereiro | dia 30, ref. 10/02/2026 | 31/01 → 01/03 |
| Fechamento dia 31, abril | dia 31, ref. 10/04 | 01/04 → 01/05 |
| Fechamento dia 31, fevereiro | dia 31, ref. 10/02 | 01/02 → 01/03 |
| Fechamento dia 31, dezembro→janeiro | dia 31, ref. 05/01 | 01/01 → 01/02 |
| Venda às 23:59 do dia do fechamento | dia 15, venda 15/09 23:59 BRT | **dentro** do período |
| Venda às 00:00 do dia seguinte | dia 15, venda 16/09 00:00 BRT | **fora** (próximo período) |
| Venda às 21:00 BRT do dia do fechamento | 15/09 21:00 BRT = 16/09 00:00 UTC | **dentro** — prova o fuso |
| Horário de verão (se voltar) | transição no meio do período | Nenhum instante em dois períodos, nenhum em zero |
| `previousPeriod`/`nextPeriod` | encadeados 24 vezes | Sem buraco e sem sobreposição entre janelas consecutivas |

Propriedade a testar de forma genérica (property-based, se a ferramenta permitir): para
qualquer `closing_day` e qualquer instante, o instante pertence a **exatamente um** período.

### `sales/sale-totals.ts` — aritmética

| Caso | Esperado |
|---|---|
| `2 × 25,00` | `50,00` |
| `3 × 0,33` | `0,99` (arredonda por item, depois soma) |
| `3 × 33,333` recusado no DTO | preço tem 2 casas |
| Soma de 100 itens de `0,01` | `1,00` exato |
| Desconto maior que o total | erro de validação |
| Desconto igual ao total | erro (`total > 0`) |
| Arredondamento meio-a-cima | `0,125` → `0,13` |
| `Decimal` em toda a cadeia | nenhum `Number` intermediário (teste de tipo/lint) |

### `sales/sale-status.policy.ts`

A tabela de decisão de [21](21-inadimplencia.md#estado-da-venda-tabela-de-decisão), linha
por linha, mais:

| Caso | Esperado |
|---|---|
| Pago = total, vencida | `PAID` (pagamento vence o vencimento) |
| Pago = 0, vence hoje | `PENDING` (não vencida no dia do vencimento) |
| Pago = 0, venceu ontem | `OVERDUE` |
| Pago parcial, venceu ontem | `OVERDUE` |
| Cancelada com pagamento total | `CANCELED` (cancelamento vence tudo) |
| Pago > total | estado impossível → lança |

### `customers/customer-status.policy.ts`

| Caso | Esperado |
|---|---|
| Sem venda em aberto | `REGULAR` |
| Uma venda em aberto não vencida | `REGULAR` |
| Uma vencida há 1 dia | `OVERDUE` |
| Uma vencida há 29 dias | `OVERDUE` |
| Uma vencida há exatamente 30 dias | `DELINQUENT` (limite inclusivo) |
| Uma vencida há 31 dias | `DELINQUENT` |
| Vencida há 40 dias + em dia | `DELINQUENT` |
| Vencida há 5 dias quitada agora | `REGULAR` |
| Vencida com saldo residual de R$ 0,01 | `OVERDUE` |
| `delinquencyDays` customizado (15) | respeita o parâmetro |

### Cálculo de limite

| Caso | Limite | Utilizado | Venda | Esperado |
|---|---|---|---|---|
| Exatamente igual | 1000 | 0 | 1000 | **permitida** |
| Estourado por 1 centavo | 1000 | 0 | 1000,01 | bloqueada |
| Estourado por 1 centavo acumulado | 1000 | 999,99 | 0,02 | bloqueada |
| Limite zero | 0 | 0 | qualquer | bloqueada |
| Venda à vista com limite zerado | 0 | 1000 | qualquer | **permitida** |
| Disponível negativo após liberação | 1000 | 1300 | qualquer | bloqueada, disponível `−300` |
| Utilizado ignora canceladas | 1000 | 500 + 500 canceladas | 500 | permitida |

## Integração — com Postgres real (testcontainers)

### Venda

- venda à vista: cria venda `PAID`, N movimentações `OUT`/`SALE`, 1 pagamento, 1
  comprovante, estoque debitado;
- venda a prazo: cria venda `PENDING`, `paid_amount = 0`, limite consumido, cliente
  recalculado;
- venda a prazo sem `customerId` → recusada (e o `CHECK` do banco também recusa, testado
  com SQL direto);
- venda a prazo sem `dueDate` → aplica `FINANCE_DEFAULT_DUE_DAYS`;
- venda com item de outra empresa → 404, nada gravado;
- venda com `customerId` de outra empresa → 404 **e** a FK composta recusa se o service for
  contornado;
- venda com 50 itens: uma transação, 50 movimentações, 1 comprovante;
- venda com o mesmo item em duas linhas: validação consolida, gravação mantém as duas
  linhas;
- **falha parcial**: forçar erro após o `INSERT` das movimentações (mock de exceção) →
  nenhuma venda, nenhuma movimentação, estoque intacto;
- **um comprovante por venda**, não um por item (regressão do impacto em `receipts`).

### Estoque

- estoque exatamente igual à quantidade → permitida, saldo final zero;
- estoque insuficiente por 1 unidade → bloqueada, nada gravado;
- item inativo → bloqueada, não liberável;
- cancelamento gera movimentação `IN`/`SALE_CANCELLATION`, a `OUT` original permanece;
- `CHECK (stock >= 0)` recusa saldo negativo mesmo com `UPDATE` direto no banco;
- cancelar duas vezes → segunda recusada (`TRANSICAO_INVALIDA`), estoque devolvido uma vez;
- **idempotência no banco**: `INSERT` manual de segunda movimentação com o mesmo
  `(sale_item_id, origin)` → violação de índice único;
- movimentação manual (`POST /stock-movements`) nunca deixa o estoque negativo — regressão do
  MVP, que continua valendo sem alteração.

### Pagamentos

- pagamento parcial → `PARTIALLY_PAID`, saldo correto;
- pagamento total → `PAID`;
- dois parciais somando o total → `PAID`;
- pagamento de R$ 0,01 acima do saldo → `PAGAMENTO_EXCEDE_SALDO`, nada gravado;
- pagamento no dia do vencimento → venda não fica `OVERDUE` em momento algum;
- pagamento um dia após o vencimento → venda passou por `OVERDUE` e termina `PAID`;
- pagamento em venda cancelada → recusado;
- pagamento regulariza o cliente e gera `customer_status_events`;
- quitação parcial de título vencido **não** regulariza;
- estorno devolve o saldo, recalcula status e pode reinadimplir;
- estorno de estorno → recusado;
- rota de estorno é `POST /payments/:id/reversal` e exige `reason` ([PD-15](31-decisoes-pendentes.md#pd-15));
- `CHECK` do banco recusa `paid_amount > total` mesmo com `UPDATE` direto.

### Liberações

- venda bloqueada devolve **todos** os motivos, com `authorizable` correto por motivo;
- senha correta libera; venda criada com N linhas em `sale_authorizations`;
- senha incorreta → 403, nada gravado, tentativa auditada **sem a senha**;
- senha não configurada → `SENHA_ADMINISTRATIVA_NAO_CONFIGURADA`, liberação indisponível;
- autorizar só um de dois motivos → venda recusada por inteiro;
- motivo novo surgido entre o 422 e a liberação → venda recusada (revalidação sob lock,
  simulada com venda concorrente);
- `INSUFFICIENT_STOCK` **nunca** é liberável, mesmo com senha correta e mesmo listado em
  `reasons` (RN-21 mantida, [PD-01](31-decisoes-pendentes.md#pd-01));
- `CUSTOMER_INACTIVE`, `ITEM_INACTIVE` e `CUSTOMER_BLOCKED` nunca são liberáveis;
- `authorizable = false` chega na resposta para todo motivo não liberável;
- a senha não aparece em `audit_logs`, em log capturado nem na resposta (asserção
  explícita, varrendo os três).

### Fechamento

- competência: soma vendas por `sold_at`, ignora canceladas;
- caixa: soma pagamentos por `paid_at`, ignora estornados;
- venda de setembro paga em outubro: aparece em "vendido" de setembro **e** em
  "recebido de períodos anteriores" de outubro;
- **venda liberada por dois motivos conta uma vez** no total liberado (`DISTINCT sale_id`) —
  o erro mais provável do painel;
- vendas sem cliente aparecem na linha consolidada e a soma por cliente bate com o total;
- `closing_day` alterado no meio do período: vendas anteriores mantêm a janela congelada;
- período sem venda nenhuma → zeros, não erro nem `null`.

### Job de atraso

- venda vencida ontem, job roda → `OVERDUE` e cliente `OVERDUE`;
- job roda duas vezes → nenhum evento duplicado em `customer_status_events`;
- duas réplicas simultâneas → só uma executa (advisory lock);
- job **não** roda → validação de venda a prazo ainda bloqueia corretamente (prova de que
  a correção não depende dele).

## Concorrência

Testes com transações reais e paralelismo controlado. Sem `sleep`.

| Cenário | Esperado |
|---|---|
| Estoque 10, duas vendas de 8 simultâneas | Uma passa, outra recebe 422 com o saldo real; estoque final 2 |
| Estoque 10, duas vendas de 5 simultâneas | As duas passam; estoque final 0 |
| Limite 1000, duas vendas a prazo de 600 do mesmo cliente | Uma passa, outra bloqueada; utilizado 600 |
| Limite 1000, duas vendas de 500 do mesmo cliente | As duas passam; utilizado 1000 |
| Duas vendas dos mesmos dois itens em ordem inversa | Nenhum deadlock (`ORDER BY id`) |
| Dois recebimentos simultâneos do saldo total | Um passa, outro `PAGAMENTO_EXCEDE_SALDO` |
| Cancelamento e recebimento simultâneos | Serializados; resultado consistente nos dois casos possíveis |
| Duas confirmações de venda com contenção acima do `lock_timeout` | 409 `CONFLITO_DE_CONCORRENCIA`, nunca 500 |
| 10 vendas simultâneas na mesma empresa | 10 números de venda e 10 de comprovante, sem buraco e sem repetição |

Os dois últimos são os que quebram implementações ingênuas: contenção virando 500, e
numeração com furo.

## Segurança

Todos automatizados, todos no CI (o teste de isolamento é inegociável, docs/12):

- empresa B lendo cliente / venda / pagamento / liberação / fechamento da empresa A → 404;
- empresa B criando venda com `customerId` da empresa A → 404, e a FK composta recusa;
- empresa B tentando pagar venda da empresa A → 404;
- Super Admin acessando qualquer rota da fase 2 → 404;
- Colaborador tentando cancelar, estornar, liberar, alterar limite (`customer-credit:update`)
  ou ver fechamento → 403;
- usuário sem token → 401;
- empresa com assinatura `PAST_DUE` → `GET` funciona, `POST /sales` e `POST /payments` são
  negados;
- empresa `SUSPENDED` → login negado;
- força bruta na senha administrativa → rate limit (429) e depois lockout;
- **cobertura de escopo**: teste que enumera os models do schema com `company_id` e falha
  se algum não estiver em `TENANT_SCOPED_MODELS` (transforma esquecimento em CI vermelho);
- teste de RLS com o papel `promei_app` cobrindo as tabelas novas.

## Casos extremos — lista de verificação

Todos os itens pedidos, com o local onde estão cobertos:

| Caso | Onde |
|---|---|
| Limite exatamente igual à compra | Unit (limite) |
| Limite ultrapassado em R$ 0,01 | Unit (limite) |
| Estoque exatamente igual à quantidade | Integração (estoque) |
| Estoque insuficiente | Integração (estoque) |
| Pagamento parcial | Integração (pagamentos) |
| Pagamento no vencimento | Integração + unit (status) |
| Pagamento após vencimento | Integração (pagamentos) |
| 30 dias de atraso (29, 30 e 31) | Unit (situação do cliente) |
| Mudança de período | Unit (`period`) + integração (fechamento) |
| Fechamento dia 1 | Unit (`period`) |
| Fechamento dia 28 | Unit (`period`) |
| Fechamento dia 29 | Unit (`period`), comum e bissexto |
| Fechamento dia 30 | Unit (`period`) |
| Fechamento dia 31 | Unit (`period`), todos os meses |
| Fevereiro | Unit (`period`) |
| Ano bissexto | Unit (`period`), 2028 |
| Estoque insuficiente não é liberável nem com senha | Integração (liberações) |
| Venda de valor 0 | Unit + `CHECK` do banco |
| Cliente sem documento | Integração (único parcial) |
| Limite de clientes do plano excedido | Integração (RN-14, `maxCustomers`) |
| Cliente anonimizado mantém vendas e não aceita venda nova | Integração (clientes, LGPD) |
| Venda sem cliente | Integração (venda + fechamento) |

## E2E (Playwright)

Somam-se aos 5 fluxos do MVP:

1. cadastrar cliente → venda a prazo → recebimento parcial → recebimento total → venda `PAID`;
2. venda a prazo bloqueada por limite → liberação com senha → venda criada com a marca de
   liberada;
3. cancelamento de venda com estoque devolvido, visível no histórico do item;
4. painel de fechamento com venda de período anterior paga no período corrente.

## O que bloqueia a entrega

Além dos gates de [12](12-estrategia-de-testes.md):

- qualquer teste de concorrência falhando;
- qualquer teste de isolamento cross-tenant falhando;
- model com `company_id` fora de `TENANT_SCOPED_MODELS`;
- tabela nova sem policy de RLS;
- senha administrativa aparecendo em qualquer log ou resposta;
- migração sem validação em staging.
