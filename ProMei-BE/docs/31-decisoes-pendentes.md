# Decisões da fase 2 — registro

Este documento nasceu como lista de ambiguidades e inconsistências do requisito. **Todas as
17 foram decididas em 02/09/2026** e o registro fica aqui: problema, alternativas
consideradas, decisão tomada e onde ela está aplicada.

Nada foi resolvido em silêncio, e nada foi revertido depois sem passar por aqui. Se uma
decisão mudar, muda **primeiro** neste arquivo e depois nos documentos afetados.

| # | Assunto | Decisão |
|---|---|---|
| [PD-01](#pd-01) | Estoque negativo × RN-21 | **RN-21 mantida absoluta** — sem estoque negativo, sem liberação de estoque |
| [PD-02](#pd-02) | Cancelamento devolve limite | **Devolve** |
| [PD-03](#pd-03) | Disponível negativo | **Devolver os dois valores** (real e zerado) |
| [PD-04](#pd-04) | Contador de limite materializado | **Somar sempre**; materializar só com medição |
| [PD-05](#pd-05) | `OVERDUE` derivado × job | **Derivado é autoridade + job para listagem** |
| [PD-06](#pd-06) | Desconto | **Desconto no total da venda** |
| [PD-07](#pd-07) | Quantidade fracionária | **Inteiro na fase 2** |
| [PD-08](#pd-08) | Limite de clientes por plano | **Adicionar `maxCustomers`** |
| [PD-09](#pd-09) | Parcelamento | **Fora da fase 2** |
| [PD-10](#pd-10) | Biblioteca de datas | **`date-fns` + `date-fns-tz`**, restrito ao `finance` |
| [PD-11](#pd-11) | Pagamento acima do saldo | **Recusar sempre** |
| [PD-12](#pd-12) | Venda duplicada por retry | **Botão do front agora**, `Idempotency-Key` na 2.1 |
| [PD-13](#pd-13) | Senha administrativa | **Uma por empresa** |
| [PD-14](#pd-14) | Fechamento formal | **Só painel na fase 2**; snapshot na 2.1 |
| [PD-15](#pd-15) | Rota de estorno | **`POST /payments/:id/reversal`** |
| [PD-16](#pd-16) | Granularidade do crédito | **Recurso `customer-credit`** |
| [PD-17](#pd-17) | LGPD: exclusão de cliente | **Anonimizar**, preservando vendas |

---

<a id="pd-01"></a>
## PD-01 — Estoque negativo contradizia a RN-21

**Problema.** `docs/04-regras-de-negocio.md` diz: *"RN-21 — Estoque nunca fica negativo:
saída maior que o saldo é rejeitada"*, implementada em `inventory.service.ts` e coberta por
teste. O requisito da fase 2 pedia que uma venda com estoque insuficiente pudesse ser
liberada, deixando o saldo negativo. As duas afirmações não podiam valer ao mesmo tempo.

**Alternativas.**

| # | Opção | Consequência |
|---|---|---|
| A | Manter RN-21 absoluta | Contraria o requisito inicial, mas mantém a regra íntegra |
| B | Exceção estreita (só venda liberada, só em empresa que permita) | Regra vale no caminho comum; exceção auditada |
| C | Abrir para qualquer saída | Exceção vira rotina, sem trilha específica |

> ### ✅ Decisão: **A — RN-21 mantida absoluta**

**Consequências aplicadas:**

- **não existe** estoque negativo, em nenhum caminho e em nenhuma configuração;
- **não existe** liberação administrativa de estoque; `SaleAuthorizationType` fica só com
  `CREDIT`, e o recurso de permissão `stock-authorizations` **não é criado**;
- `INSUFFICIENT_STOCK` é bloqueio **não liberável**, na mesma categoria de `ITEM_INACTIVE`;
- `company_finance_settings` **não** tem `allow_negative_stock`;
- ganho colateral: a regra pôde virar invariante de banco —
  `ALTER TABLE items ADD CONSTRAINT items_stock_not_negative CHECK (stock >= 0)`;
- a mensagem de erro diz o caminho: *"registre a entrada do estoque antes de vender"*.

Aplicado em: [04](04-regras-de-negocio.md) (nota de confirmação),
[23](23-estoque-e-vendas.md#estoque-negativo), [24](24-liberacoes-administrativas.md),
[19](19-vendas.md#validação), [25](25-fechamento-mensal.md), [27](27-modelo-de-dados.md),
[28](28-api-contracts.md), [29](29-seguranca-e-permissoes.md), [30](30-testes.md).

---

<a id="pd-02"></a>
## PD-02 — Cancelamento devolve limite?

**Problema.** O requisito é explícito em que pagamento não devolve limite, e silencioso sobre
cancelamento. Isso define a fórmula do utilizado — o núcleo da feature.

**Alternativas.** (A) devolve; (B) não devolve; (C) devolve só no mesmo dia.

> ### ✅ Decisão: **A — cancelamento devolve o limite do período**

Fundamento: pagamento e cancelamento são coisas diferentes. Pagar significa que a compra
aconteceu e foi quitada — o volume do período permanece. Cancelar significa que a compra
**não aconteceu** — não há volume a computar.

**Mitigações obrigatórias**, porque a decisão abre o padrão "compra, cancela, recompra":

- `sales:delete` negada ao Colaborador;
- motivo de cancelamento obrigatório;
- auditoria completa (`audit_logs` + campos na própria venda);
- linhas no fechamento: "total cancelado", "quantidade de cancelamentos" e "vendas liberadas
  e canceladas depois" — se o número crescer, aparece.

Aplicado em: [20](20-limite-mensal-e-periodos.md#fórmula),
[26](26-cancelamentos-e-estornos.md#limite), [25](25-fechamento-mensal.md).

---

<a id="pd-03"></a>
## PD-03 — Limite disponível negativo

**Problema.** Após liberação, `disponível = limite − utilizado` fica negativo (limite 1.000,
utilizado 1.300). Exibir o negativo ou zerar?

**Alternativas.** (A) só o real; (B) só zerado; (C) os dois.

> ### ✅ Decisão: **C — a API devolve `available` (real, pode ser negativo) e `availableClamped` (nunca < 0)**

O back-end não destrói informação; a UI escolhe o que mostrar. Zerar no servidor apagaria o
sinal de que houve exceção.

Aplicado em: [18](18-clientes.md#resumo-financeiro-do-cliente), [28](28-api-contracts.md).

---

<a id="pd-04"></a>
## PD-04 — Contador de limite materializado

**Problema.** O utilizado é recalculado por `SUM` sobre as vendas do período a cada
validação.

**Alternativas.** (A) somar sempre; (B) contador materializado em `customer_periods`; (C)
híbrido com reconciliação noturna.

> ### ✅ Decisão: **A — somar sempre**

As vendas são a única verdade e nada pode divergir. Suficiente para o alvo de 100 empresas
(RNF-03). **B** volta à mesa quando houver medição que justifique, e nesse dia a soma sobre
vendas continua sendo a fonte de verdade, com teste de reconciliação.

Aplicado em: [20](20-limite-mensal-e-periodos.md#concorrência).

---

<a id="pd-05"></a>
## PD-05 — `OVERDUE` persistido, derivado ou os dois?

**Problema.** É o único estado que muda sozinho com o tempo; ninguém faz requisição no
instante em que a venda vence.

**Alternativas.** (A) só derivado; (B) só job; (C) derivado como autoridade + job para
listagem.

> ### ✅ Decisão: **C — derivação na leitura é a autoridade; job diário materializa para listagem e filtro**

A propriedade que torna isso seguro está registrada como **RN-67**: *nenhuma decisão de
crédito depende do job ter rodado*. Se o job ficar três dias parado, só as listagens
filtradas por "em atraso" ficam desatualizadas.

**Dependência nova aceita:** `@nestjs/schedule` (agendador in-process; [07](07-stack.md)
descarta fila, não agendador), com `pg_advisory_lock` para que múltiplas réplicas não rodem o
job em paralelo.

Aplicado em: [21](21-inadimplencia.md#materialização), [32](32-plano-de-implementacao.md).

---

<a id="pd-06"></a>
## PD-06 — Desconto

**Problema.** O requisito não menciona desconto, mas balcão de MEI dá desconto o tempo todo.

**Alternativas.** (A) nenhum, só preço unitário livre; (B) desconto no total; (C) por item e
no total.

> ### ✅ Decisão: **B — `sales.discount`, aplicado depois da soma dos itens**

`unitPrice` livre por item cobre a negociação linha a linha; o desconto no total cobre o
"arredonda pra mim". `total > 0` continua garantido por `CHECK`. **C** fica para quando
existir devolução parcial, que é quando o rateio passa a importar.

Aplicado em: [19](19-vendas.md#aritmética-do-dinheiro), [27](27-modelo-de-dados.md).

---

<a id="pd-07"></a>
## PD-07 — Quantidade fracionária

**Problema.** `items.stock` e `stock_movements.quantity` são `Int`. Um MEI de alimentos vende
1,5 kg — e `CompanySegment.FOOD` já existe no schema.

**Alternativas.** (A) manter inteiro; (B) `Decimal(12,3)` agora; (C) representar fração pela
unidade (vender em gramas).

> ### ✅ Decisão: **A — inteiro na fase 2**

O requisito não pede, e mexer no módulo de estoque do MVP (estável e testado) tem custo real.
Fica **registrado como migração conhecida**: `Int → Decimal(12,3)` em `items.stock`,
`stock_movements.quantity` e `sale_items.quantity`, com impacto em validação, comprovante e
relatórios. Quanto mais tarde, mais cara — e essa é a aposta assumida.

**C** foi recusada: transfere a conversão para o operador e o comprovante sai em gramas.

---

<a id="pd-08"></a>
## PD-08 — Limite de clientes por plano

**Problema.** `plans.limits` (JSONB) tem `maxUsers` e `maxItems`. Cliente é o novo recurso
que cresce por empresa.

**Alternativas.** (A) sem limite; (B) `maxCustomers`; (C) `maxCustomers` +
`maxSalesPerMonth`.

> ### ✅ Decisão: **B — `plans.limits.maxCustomers`**

Segue a RN-14: exceder bloqueia novos cadastros, não apaga existentes. O mecanismo já existe
e está testado (`plan-limits.spec.ts`). **C** foi recusada: limitar vendas por mês pune o
cliente que mais usa e mais paga.

Aplicado em: [27](27-modelo-de-dados.md), [28](28-api-contracts.md), [18](18-clientes.md),
[30](30-testes.md).

---

<a id="pd-09"></a>
## PD-09 — Parcelamento / carnê

**Problema.** Uma venda a prazo tem **um** vencimento; o MEI costuma vender "em 3 vezes".

**Alternativas.** (A) fora da fase 2; (B) incluir agora; (C) o operador cria N vendas na mão.

> ### ✅ Decisão: **A — fora da fase 2**

A modelagem **acomoda** parcelas depois: `payments` já é N por venda, e parcelamento
acrescenta o **cronograma esperado** (`sale_installments`), não o recebimento. Quando entrar,
o status da venda passa a derivar das parcelas, e limite e inadimplência mudam de sujeito.

**C** foi recusada explicitamente: polui o histórico e triplica o consumo de limite.

---

<a id="pd-10"></a>
## PD-10 — Biblioteca de datas

**Problema.** A aritmética de período com fuso e saturação de dia (29/30/31, fevereiro,
bissexto) é onde os bugs desta fase moram. O projeto não tem biblioteca de datas.

**Alternativas.** (A) `Intl` + `Date` nativos; (B) `date-fns` + `date-fns-tz`; (C) `Temporal`
(sem suporte estável no Node 22 sem polyfill).

> ### ✅ Decisão: **B — `date-fns` + `date-fns-tz`, restritas ao módulo `finance`**

`endOfMonth`, `addMonths` e conversão de fuso testadas por milhões de usuários valem mais que
200 linhas próprias de calendário. É a única dependência que a fase 2 adiciona por
conveniência (a outra, `@nestjs/schedule`, vem do PD-05). Registrar as duas em
[07-stack.md](07-stack.md).

---

<a id="pd-11"></a>
## PD-11 — Pagamento acima do saldo

**Problema.** O requisito dizia "impedir pagamentos superiores ao saldo pendente, salvo se
existir uma regra administrativa explicitamente definida" — sem definir essa regra.

**Alternativas.** (A) recusar sempre; (B) aceitar e guardar como crédito do cliente; (C)
aceitar com liberação administrativa.

> ### ✅ Decisão: **A — recusar sempre, com `422 PAGAMENTO_EXCEDE_SALDO` informando o saldo real**

Cliente paga R$ 100 numa conta de R$ 80: registra R$ 80, e os R$ 20 se resolvem fora do
sistema. Mantém `paid_amount ≤ total` (garantido por `CHECK`), o saldo e o "Total recebido"
coerentes.

**B** é a evolução correta quando o negócio quiser adiantamento — e é feature própria, com
suas perguntas (expira? é devolvido? aplica em qual venda?). **C** foi recusada: gera dado
inconsistente *com* autorização, que é o pior dos mundos.

Aplicado em: [22](22-recebimentos.md#pagamento-acima-do-saldo).

---

<a id="pd-12"></a>
## PD-12 — Venda duplicada por retry

**Problema.** A transação garante consistência de **uma** venda, não ausência de duas. Duplo
clique ou retry de rede cria venda duplicada: estoque baixado duas vezes, limite consumido
duas vezes.

**Alternativas.** (A) mitigar na UI; (B) `Idempotency-Key` com tabela e expiração; (C)
deduplicação por hash do payload.

> ### ✅ Decisão: **A na fase 2 (front desabilita o botão), B na fase 2.1**

**C** foi recusada: duas vendas idênticas legítimas existem — o cliente voltou e comprou o
mesmo item.

Aplicado em: [23](23-estoque-e-vendas.md#idempotência),
[32](32-plano-de-implementacao.md) (nota para o front).

---

<a id="pd-13"></a>
## PD-13 — Senha administrativa: de quem?

**Problema.** Senha por empresa é simples e reflete o balcão real, mas é compartilhada e o
lockout afeta todos os operadores. Senha por usuário identifica melhor, mas custa gestão.

**Alternativas.** (A) uma por empresa; (B) uma por usuário autorizado; (C) a própria senha de
login do usuário.

> ### ✅ Decisão: **A — uma senha por empresa**

**Duas consequências assumidas, registradas para não serem redescobertas:**

1. a senha **não identifica** quem liberou — quem aparece em `authorized_by` é o usuário do
   JWT. Aceitável porque a senha é o *segundo* fator; o primeiro é estar logado com a
   permissão;
2. o lockout afeta o balcão inteiro. Mitigação: o lockout **não** bloqueia vendas normais,
   só liberações; o rate limit é **por usuário** antes de ser por empresa; e toda tentativa
   falha é auditada com autor e IP.

**C** continua sendo a alternativa mais elegante (identifica quem, não cria segredo novo) e
pode ser revisitada — a objeção prática é o dono digitar a senha de login dele no balcão, na
frente do cliente.

Aplicado em: [24](24-liberacoes-administrativas.md#a-senha-administrativa),
[29](29-seguranca-e-permissoes.md).

---

<a id="pd-14"></a>
## PD-14 — Fechamento formal (snapshot)

**Problema.** O painel calculado atende ao requisito; o snapshot em `period_closures` é
extra.

**Alternativas.** (A) só painel; (B) painel + fechamento formal; (C) fechamento que bloqueia
lançamentos.

> ### ✅ Decisão: **A na fase 2; B na fase 2.1**

Nada precisa ser executado para o fechamento existir — não há "o fechamento de setembro não
rodou". A tabela `period_closures` e a rota `POST /closings` ficam desenhadas e **fora do
escopo** desta entrega.

**C** foi recusada: bloquear o período impediria registrar o recebimento de um título antigo,
que é um fato que realmente aconteceu.

Aplicado em: [25](25-fechamento-mensal.md#fechamento-formal-fase-21),
[27](27-modelo-de-dados.md), [28](28-api-contracts.md).

---

<a id="pd-15"></a>
## PD-15 — Rota do estorno

**Problema.** O estorno exige `reason` obrigatório. `DELETE` com corpo é válido em HTTP mas
incomum; query string vaza para log.

**Alternativas.** (A) `DELETE /payments/:id` com corpo; (B) `POST /payments/:id/reversal`;
(C) `DELETE` com `?reason=`.

> ### ✅ Decisão: **B — `POST /payments/:id/reversal`**

Sub-recurso REST legítimo, corpo garantido, motivo fora do log de acesso. A permissão
continua sendo `payments:delete`, que é o par do catálogo que representa "desfazer um
recebimento".

Aplicado em: [28](28-api-contracts.md), [22](22-recebimentos.md),
[26](26-cancelamentos-e-estornos.md), [30](30-testes.md).

---

<a id="pd-16"></a>
## PD-16 — Granularidade do crédito

**Problema.** `customers:update` cobria "corrigir o telefone" e "dar R$ 5.000 de crédito".

**Alternativas.** (A) manter, com rota sensível e papel customizado; (B) recurso
`customer-credit`; (C) ação nova `authorize` no catálogo.

> ### ✅ Decisão: **B — recurso `customer-credit` com `create`/`read`/`update`/`delete`**

`PATCH /customers/:id/credit-limit` e `/credit-block` passam a exigir
`customer-credit:update`. Uma linha no catálogo, e a separação passa a ser garantida em vez
de convencionada. **C** foi recusada: poluiria o produto cartesiano do catálogo e mexeria no
formato `recurso:ação` gravado no JWT (ADR-0005).

Aplicado em: [29](29-seguranca-e-permissoes.md#separação-de-crédito),
[28](28-api-contracts.md), [18](18-clientes.md#alteração-de-limite).

---

<a id="pd-17"></a>
## PD-17 — LGPD: exclusão de cliente com histórico

**Problema.** Cliente é titular de dados pessoais e pode pedir exclusão (docs/09). Apagá-lo
destruiria vendas que a empresa precisa manter.

**Alternativas.** (A) anonimizar preservando vendas; (B) recusar exclusão enquanto houver
venda; (C) apagar tudo em cascata.

> ### ✅ Decisão: **A — anonimizar**

Nome → "Cliente removido"; `document`, `email`, `phone`, `address` → `NULL`; `anonymized_at`
preenchido; cliente passa a `INACTIVE` e não aceita venda nova. Vendas, pagamentos e
movimentações **permanecem** — a base legal para reter o registro comercial é distinta da que
sustentava o cadastro.

> ⚠️ **Pendência que bloqueia produção, não o código:** a redação final e a base legal
> precisam de **validação jurídica** antes do go-live. O campo `anonymized_at` já está no
> modelo ([27](27-modelo-de-dados.md)).

Aplicado em: [18](18-clientes.md), [27](27-modelo-de-dados.md),
[29](29-seguranca-e-permissoes.md), [30](30-testes.md).

---

## O que ficou aberto

Nenhuma decisão bloqueia o início da implementação. O que permanece em aberto, por natureza:

| Item | Tipo | Quando |
|---|---|---|
| Validação jurídica da anonimização ([PD-17](#pd-17)) | Jurídico | Antes do go-live |
| Migração `Int → Decimal` de quantidade ([PD-07](#pd-07)) | Técnico | Quando surgir cliente que vende fracionado |
| Contador de limite materializado ([PD-04](#pd-04)) | Performance | Quando houver medição que justifique |
| `Idempotency-Key` ([PD-12](#pd-12)) | Técnico | Fase 2.1 |
| Fechamento formal ([PD-14](#pd-14)) | Produto | Fase 2.1 |
| Parcelamento ([PD-09](#pd-09)) | Produto | Fase 3 |
| Crédito do cliente / adiantamento ([PD-11](#pd-11)) | Produto | Quando o negócio pedir |
| Devolução financeira (`refunds`) e devolução parcial | Produto | [26](26-cancelamentos-e-estornos.md#estorno-como-fluxo-financeiro-conceitual) |
