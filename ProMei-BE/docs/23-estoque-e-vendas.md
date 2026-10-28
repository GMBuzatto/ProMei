# Estoque nas vendas

> Movimentação do MVP: [06](06-arquitetura.md) e
> `src/modules/inventory` · Modelo em [27](27-modelo-de-dados.md)

## Princípio

A movimentação de estoque continua sendo **exatamente o que já é**: registro imutável,
append-only, do qual o saldo é derivado (RN-22). A fase 2 não muda isso. Ela só acrescenta
**origem**.

```text
StockMovement.origin:
  MANUAL             lançada à mão pelo operador (é o comportamento do MVP)
  SALE               baixa gerada pela confirmação de uma venda
  SALE_CANCELLATION  entrada gerada pelo cancelamento de uma venda
```

Movimentações com `origin = SALE` ganham `sale_id` e `sale_item_id`; as manuais mantêm os
dois `NULL`. Nenhuma movimentação existente precisa ser migrada além de receber
`origin = 'MANUAL'` como default — a migração é aditiva.

## Validação de estoque

Antes de confirmar a venda, dentro da transação e com as linhas dos itens travadas:

```text
para cada item da venda:
    disponível = items.stock
    se quantidade > disponível  →  bloqueio INSUFFICIENT_STOCK
```

A mensagem é específica por item e diz os dois números:

```text
Quantidade solicitada superior ao estoque disponível: PARAF-001 —
disponível 10, solicitado 15.
```

Como todos os bloqueios ([19](19-vendas.md#validação)), o erro traz **todos** os itens sem
saldo, não apenas o primeiro. Um pedido de 8 linhas com 3 furos precisa mostrar os 3 — o
contrário obriga o operador a descobrir os problemas um por requisição.

O mesmo item aparecendo em duas linhas da venda é **consolidado antes** da validação:
duas linhas de 6 unidades com saldo 10 é um furo de 2, não duas linhas válidas. Consolidar
na validação e manter as linhas separadas na gravação — o operador tem motivo para lançar
duas linhas (preços ou descontos diferentes).

## Baixa de estoque

```text
Venda confirmada
        ↓
   para cada sale_item
        ↓
   INSERT stock_movements (type = OUT, origin = SALE, sale_id, sale_item_id,
                           quantity, reason = 'Venda #<number>')
        ↓
   UPDATE items SET stock = stock − quantity
```

Tudo na **mesma transação** da venda. Não existe "venda criada e estoque não baixado" —
esse é o cenário que o requisito exige impossibilitar, e ele é impossível por construção,
não por cuidado.

`reason` é preenchido pelo sistema (`Venda #000123`), não pelo operador. O DTO de
movimentação manual continua exigindo `reason` do usuário (RF-32); a movimentação de venda
tem a venda como motivo, e o link é a FK.

## Idempotência

Requisito: uma mesma venda não pode gerar baixa duas vezes. Quatro camadas, da mais forte
para a mais fraca:

**1. Constraint no banco (a que realmente garante).**

```sql
CREATE UNIQUE INDEX stock_movements_sale_item_origin_uniq
    ON stock_movements (sale_item_id, origin)
 WHERE sale_item_id IS NOT NULL;
```

Um item de venda tem no máximo **uma** baixa (`SALE`) e **uma** devolução
(`SALE_CANCELLATION`). Índice único parcial porque movimentação manual tem
`sale_item_id NULL`, e `NULL` não colide em índice único no Postgres — o `WHERE` deixa a
intenção explícita em vez de depender desse comportamento.

Isso é o que sobrevive a: retry do cliente, replay de requisição, bug de service, deploy
concorrente. É a única camada que não depende de código correto.

**2. Transação única.** Baixa e venda comitam juntas; não há janela entre criar a venda e
baixar o estoque na qual um crash deixe metade feito.

**3. Estado da venda.** Cancelar exige `status ≠ CANCELED`, verificado **sob lock** da
linha da venda. Duas tentativas simultâneas de cancelar: a segunda espera, lê
`CANCELED` e é recusada com `TRANSICAO_INVALIDA`.

**4. Idempotency-Key no HTTP (opcional, fase 2.1).** Um header `Idempotency-Key` no
`POST /sales`, guardado por 24h com o `sale_id` resultante, evita venda duplicada por
duplo clique ou retry de rede — problema real de balcão. Fica como
[PD-12](31-decisoes-pendentes.md#pd-12) porque exige tabela e política de expiração
próprias.

Não usar: lock otimista por versão na venda (não protege contra duas *criações*), nem
checagem "já existe movimentação para essa venda?" antes do insert (é TOCTOU — a checagem e
o insert não são atômicos sem a constraint).

<a id="estoque-negativo"></a>
## Estoque negativo — inconsistência levantada e resolvida

Durante o design, o requisito de *estoque negativo liberado administrativamente* apareceu em
conflito direto com a documentação vigente.

`docs/04-regras-de-negocio.md`, RN-21:

> Estoque nunca fica negativo: saída maior que o saldo é rejeitada.

Requisito original da fase 2:

> Caso a `company` permita estoque negativo, uma venda com estoque insuficiente poderá ser
> liberada administrativamente. Estoque 10, venda 15 → estoque final −5.

**Decisão do negócio (2026-09-02): a RN-21 permanece absoluta.**
Registrada em [PD-01](31-decisoes-pendentes.md#pd-01).

### O que isso significa

| | |
|---|---|
| Estoque negativo | **Não existe**, em nenhum caminho e em nenhuma configuração |
| Liberação administrativa de estoque | **Não existe** — só existe liberação de crédito ([24](24-liberacoes-administrativas.md)) |
| `INSUFFICIENT_STOCK` | Bloqueio **não liberável**, na mesma categoria de `ITEM_INACTIVE` |
| Configuração `allow_negative_stock` | **Não é criada** |
| `SaleAuthorizationType` | Fica só com `CREDIT` |

Nenhuma senha administrativa vende o que não existe. O caminho quando falta mercadoria é o
que sempre foi: registrar a entrada (`POST /stock-movements` com `type = IN`) e então vender.

A mensagem de erro precisa dizer isso, porque é a diferença entre um bloqueio que o operador
resolve e um que ele fica olhando:

```text
Quantidade solicitada superior ao estoque disponível: PARAF-001 —
disponível 10, solicitado 15. Registre a entrada do estoque antes de vender.
```

E o campo `authorizable` do bloqueio vem `false` para `INSUFFICIENT_STOCK`, então a UI não
oferece o botão "Liberar venda" para um caso que nunca será liberado.

### O que se ganha com essa escolha

- `items.stock >= 0` deixa de ser regra da aplicação com exceção e passa a ser **invariante**.
  A migração pode adicionar `CHECK (stock >= 0)` na tabela `items` — a rede de segurança que
  não existia porque a exceção teria quebrado;
- o fechamento não precisa de linha "vendas com estoque negativo";
- o módulo de liberações fica com um único tipo, uma única permissão e um único caminho de
  teste;
- o comportamento hoje implementado e testado em `inventory.service.ts` continua valendo sem
  alteração — a venda simplesmente reusa a mesma regra.

> **Se essa decisão for revista no futuro**, o caminho está desenhado: reintroduzir
> `SaleAuthorizationType.STOCK`, a configuração por empresa, e remover o `CHECK`. O ponto de
> extensão fica registrado aqui de propósito, para não ser redescoberto do zero.

## Concorrência

Cenário do requisito: estoque 10, venda A de 8, venda B de 8, simultâneas.

```text
Transação A                      Transação B
BEGIN                            BEGIN
SELECT ... FOR UPDATE (item)     SELECT ... FOR UPDATE (item)  ← bloqueia
stock = 10, ok                   ⋮ esperando
UPDATE stock = 2                 ⋮
COMMIT                           ⋮
                                 stock = 2  → 8 > 2 → BLOQUEIO
                                 ROLLBACK, 422 com o saldo real
```

É o mesmo mecanismo já implementado e comentado em `InventoryService.createMovement`. A
fase 2 o estende para **múltiplos itens**, o que introduz o risco de deadlock:

```text
Venda A: itens [X, Y]     Venda B: itens [Y, X]
A trava X, B trava Y, A espera Y, B espera X  →  deadlock
```

Solução: **travar sempre na mesma ordem**, ordenando por `id`.

```sql
SELECT id, sku, name, stock, status
  FROM items
 WHERE id = ANY($1::uuid[]) AND company_id = $2::uuid
 ORDER BY id
   FOR UPDATE;
```

Um único `SELECT` com `ORDER BY id` para todos os itens da venda, não um por item em loop.
O Postgres adquire os locks na ordem do `ORDER BY`, então duas transações quaisquer pegam
os mesmos itens na mesma sequência e uma sempre espera a outra em vez de se travarem
mutuamente.

Query crua porque `FOR UPDATE` não existe na API do Prisma — e query crua **não passa pela
Client Extension de tenant**, então `company_id` entra à mão. Exatamente como já está feito
em `inventory.service.ts`, e pelo mesmo motivo lá documentado.

O `lock_timeout` por transação (`SELECT set_config('lock_timeout', ..., true)`) e a
tradução de `55P03`/`P2028` para **409 `CONFLITO_DE_CONCORRENCIA`** já existem no
`InventoryService`. Devem ser **extraídos para `src/shared/`** e usados pelos dois módulos —
copiar seria criar dois lugares para consertar o mesmo bug.

## Impacto no comprovante

No MVP, `stock_movements.receipt_id` é `@unique`: um comprovante por movimentação.

Uma venda de 5 itens gera 5 movimentações. Sem tratamento, geraria **5 comprovantes** para
uma única venda — cada um com um número sequencial da empresa, furando a numeração e
confundindo o cliente.

Solução: o comprovante passa a poder pertencer **a uma venda** em vez de a uma
movimentação.

```text
receipts.stock_movement (relação existente, 1:1)   → comprovante de saída manual (MVP)
receipts.sale_id (novo, nullable, único)           → comprovante de venda (fase 2)
```

Com `CHECK` garantindo que exatamente uma das duas origens está preenchida. Movimentações
com `origin = SALE` **não** alocam comprovante individual: quem aloca é a venda, uma vez,
dentro da mesma transação, com o mesmo advisory lock de numeração que
`ReceiptsService.allocate` já usa.

O `ReceiptPdfService` precisa aprender a renderizar as duas formas: a atual (uma
movimentação, um item) e a nova (uma venda, N itens, com cliente, condição e vencimento).
Isso é trabalho real de layout e está previsto no plano ([32](32-plano-de-implementacao.md)).

## Regras de negócio

| Regra | Descrição |
|---|---|
| RN-80 | Toda movimentação tem origem: `MANUAL`, `SALE` ou `SALE_CANCELLATION`. |
| RN-81 | A baixa de estoque acontece na mesma transação da venda; não existe venda confirmada sem baixa. |
| RN-82 | Um item de venda gera no máximo uma baixa e uma devolução, garantido por índice único no banco. |
| RN-83 | Itens repetidos na mesma venda são consolidados para efeito de validação de saldo. |
| RN-84 | Estoque nunca fica negativo (RN-21 mantida): nem por venda, nem por movimentação manual, nem com liberação administrativa. |
| RN-85 | `INSUFFICIENT_STOCK` é bloqueio não liberável; o caminho é dar entrada no estoque antes de vender. |
| RN-86 | Uma venda gera **um** comprovante, não um por item. |
