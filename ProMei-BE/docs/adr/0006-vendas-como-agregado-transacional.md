# ADR-0006: Venda como agregado transacional único

- Status: proposta
- Data: 2026-09-02
- Contexto: fase 2 — Cliente + Compras ([docs/17](../17-fase-2-visao-geral.md))

## Contexto

A fase 2 introduz a venda, que precisa, em um único ato:

- validar limite de crédito, inadimplência, débitos vencidos e estoque;
- criar cabeçalho e itens;
- baixar estoque de N itens;
- registrar liberações administrativas, quando houver;
- registrar o pagamento (venda à vista);
- emitir comprovante numerado;
- atualizar a situação financeira do cliente.

O requisito é explícito sobre os estados que **não** podem existir: venda sem baixa de
estoque, baixa sem venda, venda sem o pagamento inicial.

Havia duas formas de organizar isso.

## Decisão

**A venda é criada e confirmada na mesma requisição, dentro de uma única transação de banco.
Não existe venda em rascunho persistida, e não existe venda com estado `BLOCKED`.**

Uma venda bloqueada **não é gravada**: a resposta é `422` com todos os motivos, e a
liberação administrativa é enviada na **repetição** do mesmo `POST`, com senha e a lista de
motivos autorizados.

## Justificativa

**Rascunho persistido cria uma pergunta sem resposta boa:** o rascunho reserva estoque?

- se reserva, aparece estoque fantasma — mercadoria indisponível para venda real por causa
  de um carrinho que ninguém vai fechar, e nasce a necessidade de expiração de reserva, que
  é fila e cron para um MEI de balcão;
- se não reserva, a validação feita no rascunho é mentirosa: ao confirmar, tudo precisa ser
  revalidado — e aí o rascunho não serviu para nada além de ocupar tabela.

Carrinho é estado de **UI**. O front monta a venda em memória e envia uma vez.

**Transação única é a forma mais simples de tornar impossíveis os estados proibidos.** Não
"improváveis com cuidado": impossíveis. O rollback do Postgres é mais confiável que qualquer
compensação escrita à mão, e o projeto já usa esse padrão em
`InventoryService.createMovement` (`withTenantSession` com lock e timeout configuráveis).

**Bloqueio não é estado da venda.** É resultado de uma validação **anterior** à existência
da venda. Persistir "venda bloqueada" criaria lixo que alguém precisaria limpar, e faria a
listagem de vendas ter linhas que não são vendas.

**A liberação na repetição do POST** mantém a atomicidade: validar, autorizar e gravar
acontecem juntos. Um fluxo em duas fases (criar autorização → usar autorização) abriria
janela para o mundo mudar entre uma coisa e outra, e reintroduziria o estado intermediário
persistido que esta decisão evita.

## Consequências

### Positivas

- os cenários proibidos pelo requisito são impossíveis por construção;
- nenhum lixo de rascunho e nenhuma rotina de expiração;
- a auditoria da liberação nasce na mesma transação da venda que ela autorizou — não existe
  venda liberada sem trilha, nem trilha sem venda;
- o padrão é o mesmo já usado e testado no estoque do MVP.

### Negativas

- **a transação é longa**: valida, trava itens, trava cliente, escreve em 5 tabelas. Exige
  `lock_timeout` e teto de transação bem calibrados (`SALES_*_MS`, docs/16) e ordem de lock
  fixa (cliente → itens por `id`) para não gerar deadlock;
- **o payload é reenviado** na liberação. Se o front não guardou a venda, o operador
  redigita. É custo de UI, e a UI já tem a venda em memória;
- **duplicata por retry não é resolvida** por esta decisão — a transação garante
  consistência de uma venda, não ausência de duas. Mitigação na UI agora,
  `Idempotency-Key` depois ([PD-12](../31-decisoes-pendentes.md#pd-12));
- **venda longa (50+ itens) segura locks por mais tempo**, afetando vendas concorrentes dos
  mesmos itens. Limitado por `SALES_MAX_ITEMS_PER_SALE`.

## Alternativas consideradas

### Rascunho persistido com confirmação separada (rejeitada)

`POST /sales` cria `DRAFT`, `POST /sales/:id/confirm` valida e efetiva. Rejeitada pelo
dilema da reserva de estoque e pelo custo de expiração. Passa a fazer sentido se um dia
houver **orçamento/pedido** — que é outro conceito (proposta ao cliente, sem efeito em
estoque nem em crédito), e que deve nascer como entidade própria, não como venda em
rascunho.

### Saga / compensação (rejeitada)

Criar venda, depois baixar estoque, compensando em caso de falha. Rejeitada: complexidade de
sistema distribuído num monolito com um único banco, com pior garantia. A ADR-0001 e a
[docs/07](../07-stack.md) já dizem "monolito modular até doer".

### Autorização como recurso prévio (rejeitada)

`POST /sale-authorizations` gera um token, `POST /sales` o consome. Rejeitada: reintroduz
estado intermediário, exige expiração do token, e abre a janela entre autorizar e vender —
justamente onde o estoque pode acabar.

## Referências

- [docs/19 — Vendas](../19-vendas.md)
- [docs/23 — Estoque nas vendas](../23-estoque-e-vendas.md)
- [docs/24 — Liberações administrativas](../24-liberacoes-administrativas.md)
- [ADR-0003](0003-multi-tenancy-postgres.md) — escopo de tenant e `withTenantSession`
- `src/modules/inventory/inventory.service.ts` — o padrão transacional que esta ADR estende
