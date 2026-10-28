# Contratos de API — fase 2

> Padrão de API em [08](08-padroes-de-desenvolvimento.md) · Permissões em [29](29-seguranca-e-permissoes.md)

## Padrão herdado (não inventar nada novo)

Verificado no código atual antes de propor qualquer rota:

- prefixo `/api/v1` (`API_PREFIX`), REST, **substantivo no plural, kebab-case**;
- a rota tem o nome da **tabela**, não do módulo — `/stock-movements`, não `/inventory`
  (está comentado em `inventory.controller.ts`);
- permissão no formato `recurso:ação`, e **recurso da permissão = nome da rota**
  (`stock-movements:create` ↔ `/stock-movements`);
- mudança de estado é `PATCH /:id/status` (precedente: `PATCH /items/:id/status`);
- `company_id` **sempre** do JWT, **nunca** do corpo ou da query;
- paginação `?page=&limit=` com teto em `PAGINATION_MAX_LIMIT`; resposta
  `{ data, total, page, limit }`;
- erro padronizado `{ statusCode, code, message, correlationId }` com `code` de negócio em
  português;
- rotas de tenant não são marcadas; `@PlatformRoute()` marca as de plataforma. Usuário
  errado no lado errado recebe **404**, não 403.

Todas as rotas abaixo são **de tenant**. Nenhuma é acessível a Super Admin/Staff.

## Códigos de erro novos

Adicionar em `src/shared/errors/business.exception.ts`:

```ts
CLIENTE_NAO_ENCONTRADO: 'CLIENTE_NAO_ENCONTRADO',
CLIENTE_INATIVO: 'CLIENTE_INATIVO',
DOCUMENTO_JA_CADASTRADO: 'DOCUMENTO_JA_CADASTRADO',
LIMITE_INVALIDO: 'LIMITE_INVALIDO',
VENDA_NAO_ENCONTRADA: 'VENDA_NAO_ENCONTRADA',
VENDA_BLOQUEADA: 'VENDA_BLOQUEADA',
VENDA_CANCELADA: 'VENDA_CANCELADA',
VENDA_COM_PAGAMENTOS: 'VENDA_COM_PAGAMENTOS',
PAGAMENTO_EXCEDE_SALDO: 'PAGAMENTO_EXCEDE_SALDO',
PAGAMENTO_JA_ESTORNADO: 'PAGAMENTO_JA_ESTORNADO',
SENHA_ADMINISTRATIVA_INVALIDA: 'SENHA_ADMINISTRATIVA_INVALIDA',
SENHA_ADMINISTRATIVA_NAO_CONFIGURADA: 'SENHA_ADMINISTRATIVA_NAO_CONFIGURADA',
SENHA_ADMINISTRATIVA_BLOQUEADA: 'SENHA_ADMINISTRATIVA_BLOQUEADA',
LIBERACAO_NAO_PERMITIDA: 'LIBERACAO_NAO_PERMITIDA',
PERIODO_INVALIDO: 'PERIODO_INVALIDO',
PERIODO_JA_FECHADO: 'PERIODO_JA_FECHADO',
// Decidido no épico 9: reusamos LIMITE_PLANO_EXCEDIDO, que já existe e já é o
// código de maxUsers/maxItems — um código por regra de plano, não por recurso.
```

Reaproveitados sem alteração: `ESTOQUE_INSUFICIENTE`, `ITEM_INATIVO`,
`RECURSO_NAO_ENCONTRADO`, `PERMISSAO_NEGADA`, `VALIDACAO_FALHOU`, `TRANSICAO_INVALIDA`,
`CONFLITO_DE_CONCORRENCIA`, `ACESSO_SOMENTE_LEITURA`, `LIMITE_DE_REQUISICOES`.

<a id="erros"></a>
### O erro de venda bloqueada

É o único que estende o formato padrão, com um campo `blocks`:

```jsonc
// 422
{
  "statusCode": 422,
  "code": "VENDA_BLOQUEADA",
  "message": "A venda não pode ser confirmada: 2 impedimentos.",
  "correlationId": "…",
  "blocks": [
    {
      "reason": "INSUFFICIENT_LIMIT",
      "authorizable": true,
      "message": "Limite disponível de R$ 350,00 é menor que o total de R$ 500,00.",
      "details": { "creditLimit": "1000.00", "periodUsed": "650.00",
                   "available": "350.00", "saleTotal": "500.00" }
    },
    {
      "reason": "INSUFFICIENT_STOCK",
      "authorizable": false,
      "message": "Quantidade solicitada superior ao estoque disponível: PARAF-001 — disponível 10, solicitado 15. Registre a entrada do estoque antes de vender.",
      "details": { "items": [{ "itemId": "…", "sku": "PARAF-001", "available": 10, "requested": 15 }] }
    }
  ]
}
```

`authorizable` já vem calculado pelo servidor — o front não recalcula regra de negócio para
decidir se mostra o botão "Liberar venda", e só o mostra quando **todos** os motivos são
liberáveis. Hoje só bloqueios de crédito são ([PD-01](31-decisoes-pendentes.md#pd-01)).
`details` é o mesmo conteúdo que irá para `sale_authorizations.context` se a liberação
acontecer.

O `AllExceptionsFilter` precisa preservar campos extras da `BusinessException`; hoje ele
monta o corpo a partir de `{ code, message }`. É uma alteração pequena e localizada.

---

## Clientes

### `POST /api/v1/customers`

| | |
|---|---|
| Permissão | `customers:create` |
| Corpo | `{ name, document?, email?, phone?, address?, notes? }` |
| Resposta | `201` + cliente |
| Validação | `name` 2–120; `document` só dígitos, 11 ou 14; `email` formato |
| Erros | `DOCUMENTO_JA_CADASTRADO` (409), `VALIDACAO_FALHOU` (400), `LIMITE_PLANO_EXCEDIDO` (422 — `plans.limits.maxCustomers`, [PD-08](31-decisoes-pendentes.md#pd-08)) |
| Regras | RN-30, RN-31. O cliente nasce com `FINANCE_DEFAULT_CREDIT_LIMIT` |

**`creditLimit` NÃO entra no corpo do cadastro.** O rascunho previa aceitá-lo aqui;
a implementação do épico 9 tirou, e por um motivo que vale registrar: se
`customers:create` pudesse gravar um limite inicial, a separação de privilégio que
`customer-credit:update` existe para impor ([PD-16](31-decisoes-pendentes.md#pd-16))
estaria furada desde o cadastro — quem pode cadastrar daria crédito sem nunca ter a
permissão de crédito. Todo cliente nasce com o default de env e só muda por
`PATCH /customers/:id/credit-limit`. Mesma lógica para `blockedForCredit`, `status`
e `financialStatus`, que também não são aceitos no corpo.

### `GET /api/v1/customers`

| | |
|---|---|
| Permissão | `customers:read` |
| Query | `search` (nome/documento), `status`, `financialStatus`, `page`, `limit` |
| Resposta | `200` + `{ data, total, page, limit }`; cada linha traz `financialStatus`, `creditLimit` e `pendingTotal` |
| Nota | `search` casa nome, documento, e-mail e telefone. `pendingTotal` é `"0.00"` para todos enquanto `sales` não existir (épico 10) — o campo é do contrato desde já, para a UI não precisar pedir o `financial-summary` de cada linha |
| Regras | Escopo de tenant automático; nunca aceita `companyId` |

### `GET /api/v1/customers/:id`
`customers:read` · `200` + cadastro · `404 CLIENTE_NAO_ENCONTRADO` (também quando o cliente
é de outra empresa — nunca 403, para não confirmar existência). Esse é o código de **todas**
as rotas de cliente quando o id não pertence à empresa do token.

### `PATCH /api/v1/customers/:id`
`customers:update` · corpo parcial de cadastro (**sem** `creditLimit`, **sem**
`financialStatus`) · `200` · auditado.

### `PATCH /api/v1/customers/:id/status`
`customers:update` · `{ status: ACTIVE | INACTIVE }` · `200`. Inativar não afeta vendas em
aberto: elas continuam cobráveis.

### `PATCH /api/v1/customers/:id/credit-limit`

| | |
|---|---|
| Permissão | `customer-credit:update` — recurso próprio, separado de editar cadastro ([PD-16](31-decisoes-pendentes.md#pd-16)) |
| Corpo | `{ creditLimit: 1500.00, reason? }` — número com até 2 casas (não string), `reason` texto livre até 500 |
| Resposta | `200` + cliente + resumo recalculado |
| Erros | `LIMITE_INVALIDO` (422) acima de `FINANCE_MAX_CREDIT_LIMIT`; `VALIDACAO_FALHOU` (400) se negativo ou com mais de 2 casas — forma é 400, política é 422 |
| Regras | RN-35, RN-36. Vale a partir de agora; pode deixar o disponível negativo; sempre auditado com valor anterior e novo |

### `PATCH /api/v1/customers/:id/credit-block`
`customer-credit:update` · `{ blockedForCredit: true|false, reason? }` · bloqueio **manual**,
independente do derivado. O campo tem o mesmo nome da representação do cliente de propósito —
corpo e resposta falando línguas diferentes é fonte de bug de integração.

Auditado, e grava `customer_status_events` com `reason = MANUAL` na **mesma transação** do
cadastro. Como o bloqueio manual não altera a situação financeira derivada (RN-34),
`fromStatus` e `toStatus` saem iguais e o que mudou vai no `context`
(`{ blockedForCredit, previousBlockedForCredit, reason? }`). Repetir o estado atual é no-op:
não gera evento nem linha de auditoria.

### `GET /api/v1/customers/:id/financial-summary`

| | |
|---|---|
| Permissão | `customers:read` |
| Query | `period?` (`YYYY-MM`, padrão: corrente) |
| Resposta | `200` |

```jsonc
{
  "customerId": "…",
  "financialStatus": "OVERDUE",
  "blockedForCredit": false,
  "creditLimit": "1000.00",
  "period": {
    "label": "2026-09", "start": "2026-08-16T03:00:00.000Z", "end": "2026-09-16T03:00:00.000Z",
    "used": "650.00", "available": "350.00", "availableClamped": "350.00"
  },
  "lifetime": {
    "purchasedTotal": "12400.00", "paidTotal": "11000.00",
    "pendingTotal": "1400.00", "overdueTotal": "450.00",
    "salesCount": 42, "openSalesCount": 3
  }
}
```

A separação `period` × `lifetime` é contratual, não estética
([18](18-clientes.md#resumo-financeiro-do-cliente)).

### `GET /api/v1/customers/:id/status-events`
`customers:read` · paginado · histórico de situação financeira.

### `DELETE /api/v1/customers/:id`
`customers:delete` · `200` + `{ outcome: "DELETED" | "INACTIVATED" }` — mesmo contrato de
`DELETE /items/:id`. Exclui de fato só quando não há venda vinculada (RN-32). Enquanto `sales`
não existir (épico 10), nenhum cliente PODE ter venda e o desfecho é sempre `DELETED`.

### `POST /api/v1/customers/:id/anonymize`
`customers:delete` · `200` + cliente anonimizado. Exclusão **a pedido do titular**
(LGPD, [PD-17](31-decisoes-pendentes.md#pd-17), RN-38): `name` vira `"Cliente removido"`,
`document`/`email`/`phone`/`address` viram `null`, `anonymizedAt` é preenchido e o cliente
passa a `INACTIVE`. Nunca é exclusão física, mesmo sem venda vinculada — é o que separa esta
rota do `DELETE`. Idempotente: cliente já anonimizado devolve o estado atual sem novo evento.
Vendas, pagamentos e movimentações permanecem. `notes` **não** é limpo — apagar mais do que o
combinado é tão errado quanto apagar de menos numa operação de LGPD.

> ⚠️ A redação final e a base legal dependem de validação jurídica antes do go-live
> ([PD-17](31-decisoes-pendentes.md#pd-17)).

---

## Vendas

### `POST /api/v1/sales`

O endpoint central da fase 2. Cria **e confirma** numa transação (ADR-0006).

| | |
|---|---|
| Permissão | `sales:create` (+ `credit-authorizations:create` se houver `authorization`) |
| Corpo | ver abaixo |
| Resposta | `201` + venda completa + comprovante `PENDING` |

```jsonc
{
  "kind": "CREDIT",                     // CASH | CREDIT
  "customerId": "…",                    // obrigatório se CREDIT
  "paymentMethod": "PIX",               // obrigatório se CASH
  "dueDate": "2026-10-15",              // obrigatório se CREDIT (default: FINANCE_DEFAULT_DUE_DAYS)
  "discount": "0.00",
  "notes": "…",
  "items": [
    { "itemId": "…", "quantity": 2, "unitPrice": "25.00" }   // unitPrice opcional
  ],
  "authorization": {                    // presente só na segunda tentativa
    "password": "…",
    "reasons": ["INSUFFICIENT_LIMIT", "CUSTOMER_DELINQUENT"],
    "notes": "cliente antigo, autorizado pelo dono"
  }
}
```

| Aspecto | Detalhe |
|---|---|
| Validação sintática | `items` 1..`SALES_MAX_ITEMS_PER_SALE`; `quantity` inteiro > 0; `unitPrice` decimal ≥ 0; `dueDate` ISO date não passada; `kind`/`paymentMethod` enums |
| Validação de negócio | Limite, vencidos, inadimplência, estoque, cadastro — **todos os motivos juntos** (RN-47) |
| Erros | `422 VENDA_BLOQUEADA` (+`blocks`), `404 RECURSO_NAO_ENCONTRADO` (item/cliente), `422 ITEM_INATIVO`, `422 CLIENTE_INATIVO`, `403 SENHA_ADMINISTRATIVA_INVALIDA`, `423/422 SENHA_ADMINISTRATIVA_BLOQUEADA`, `409 CONFLITO_DE_CONCORRENCIA`, `429 LIMITE_DE_REQUISICOES` |
| Regras | RN-40 a RN-47, RN-80 a RN-86, RN-90 a RN-97 |

`unitPrice` opcional merece nota: omitido, o servidor usa `items.price` atual. Informado, é
aceito — o balcão negocia preço. Mas a diferença é registrada: um `unitPrice` abaixo do
cadastro entra em `audit_logs` do evento da venda. Ver
[PD-06](31-decisoes-pendentes.md#pd-06) para desconto por item.

Resposta:

```jsonc
{
  "id": "…", "number": "123", "formattedNumber": "000123",
  "kind": "CREDIT", "status": "PENDING",
  "customer": { "id": "…", "name": "Maria" },
  "total": "500.00", "paidAmount": "0.00", "balance": "500.00",
  "dueDate": "2026-10-15", "soldAt": "2026-09-02T18:30:00.000Z",
  "period": { "label": "2026-09", "start": "…", "end": "…" },
  "items": [ { "itemId": "…", "sku": "PARAF-001", "name": "Parafuso",
               "quantity": 2, "unitPrice": "25.00", "total": "50.00",
               "stockAfter": 8 } ],
  "authorizations": [ { "blockReason": "INSUFFICIENT_LIMIT", "type": "CREDIT",
                        "authorizedBy": "…", "authorizedAt": "…" } ],
  "receipt": { "id": "…", "number": "456", "formattedNumber": "000456",
               "pdfStatus": "PENDING", "pdfUrl": null }
}
```

`stockAfter` por item segue o precedente de `StockMovementResult` — o cliente não
reconsulta.

### `GET /api/v1/sales`
`sales:read` · query `customerId`, `status`, `kind`, `dateFrom`, `dateTo` (sobre `soldAt`),
`dueFrom`, `dueTo`, `overdue=true`, `page`, `limit` · resposta paginada com cliente e totais
resolvidos (sem N+1, como já faz o histórico de movimentações).

`dateFrom > dateTo` → `400 VALIDACAO_FALHOU`, mesmo comportamento já implementado em
`InventoryService.ensurePeriodIsValid`.

### `GET /api/v1/sales/:id`
`sales:read` · venda completa com itens, pagamentos, liberações, movimentações e
comprovante.

### `PATCH /api/v1/sales/:id/status`

| | |
|---|---|
| Permissão | `sales:delete` (é o cancelamento — ver [26](26-cancelamentos-e-estornos.md#quem-pode-cancelar)) |
| Corpo | `{ "status": "CANCELED", "reason": "…" }` |
| Resposta | `200` + venda + movimentações de devolução |
| Erros | `422 TRANSICAO_INVALIDA` (já cancelada), `422 VENDA_COM_PAGAMENTOS` (+ lista), `409 CONFLITO_DE_CONCORRENCIA` |
| Regras | RN-110 a RN-116 |

`CANCELED` é o **único** valor aceito. Os demais estados são consequência de pagamento e
tempo, nunca de requisição.

### `GET /api/v1/sales/:id/receipt` e `POST /api/v1/sales/:id/receipt/regenerate`
`receipts:read` · reaproveitam o `ReceiptsService` existente (hoje
`POST /receipts/:id/regenerate`).

---

## Pagamentos

### `POST /api/v1/payments`

| | |
|---|---|
| Permissão | `payments:create` |
| Corpo | `{ saleId, amount, method, paidAt?, notes? }` |
| Resposta | `201` + pagamento + venda atualizada (`status`, `paidAmount`, `balance`) + cliente (`financialStatus`) |
| Validação | `amount` decimal > 0; `method` enum; `paidAt` não futura (tolerância do fuso da empresa) |
| Erros | `404 VENDA_NAO_ENCONTRADA`, `422 VENDA_CANCELADA`, `422 PAGAMENTO_EXCEDE_SALDO` (com `balance` em `details`), `403 ACESSO_SOMENTE_LEITURA` (empresa inadimplente), `409 CONFLITO_DE_CONCORRENCIA` |
| Regras | RN-70 a RN-76 |

### `GET /api/v1/payments`
`payments:read` · query `saleId`, `customerId`, `method`, `dateFrom`/`dateTo` (sobre
`paidAt`), `includeReversed` (padrão `false`), `page`, `limit`.

### `POST /api/v1/payments/:id/reversal`

| | |
|---|---|
| Permissão | `payments:delete` |
| Corpo | `{ reason }` — obrigatório |
| Resposta | `201` + `{ outcome: "REVERSED" }` + venda e cliente atualizados |
| Erros | `422 PAGAMENTO_JA_ESTORNADO`, `404` |
| Regras | RN-74, RN-76. Não apaga: marca `reversed_at` |

Sub-recurso, e não `DELETE /payments/:id`, por decisão em
[PD-15](31-decisoes-pendentes.md#pd-15): o motivo é obrigatório, e corpo em `DELETE` pode ser
descartado silenciosamente por proxy — enquanto motivo em query string vazaria para log de
acesso. A permissão continua sendo `payments:delete`, porque é ela que representa "desfazer
um recebimento" no catálogo.

---

## Liberações administrativas

Não há rota de **criação**: liberação só existe dentro de `POST /sales`
([24](24-liberacoes-administrativas.md)). O que existe é consulta e a gestão da senha.

### `GET /api/v1/sale-authorizations`
`credit-authorizations:read` · query `customerId`, `saleId`, `blockReason`, `dateFrom`,
`dateTo`, `page`, `limit`.

### `PUT /api/v1/companies/me/finance-settings/admin-password`

| | |
|---|---|
| Permissão | `finance-settings:update` (recurso próprio de tenant — ver [29](29-seguranca-e-permissoes.md#recursos-e-permissões)) |
| Corpo | `{ currentUserPassword, newAdminPassword }` |
| Resposta | `204` |
| Erros | `403 SENHA_ATUAL_INCORRETA`, `422 SENHA_INVALIDA` (política de força), `429` |
| Regras | RN-95. Exige a senha **do usuário logado**, não a antiga senha administrativa |

`/companies/me/...` é rota **de tenant** e não colide com `/companies` (plataforma), que é
`@PlatformRoute()`. A permissão é `finance-settings:*`, e **não** `companies:*`: `companies`
é recurso de plataforma e o Admin de empresa não o possui. O literal `me` evita passar `companyId` na URL — que seria IDOR
esperando para acontecer.

### `GET` e `PUT /api/v1/companies/me/finance-settings`
`finance-settings:read` / `finance-settings:update` · lê e altera `closingDay`, `timezone`,
`delinquencyDays` e `defaultDueDays`. Não existe `allowNegativeStock`
([PD-01](31-decisoes-pendentes.md#pd-01)). **Nunca** devolve nem aceita o
hash da senha. Alterar `closingDay` vale a partir do próximo período
([20](20-limite-mensal-e-periodos.md#congelamento)) — e a resposta diz explicitamente qual
é a próxima janela, para a UI poder avisar.

---

## Fechamento

### `GET /api/v1/closings/summary`
`closings:read` · query `period=YYYY-MM` **ou** `from`/`to` (excludentes) · devolve o painel
de [25](25-fechamento-mensal.md), com os blocos `sales`, `cash`, `openPosition`,
`authorizations` claramente separados e cada um com sua janela declarada.
`PERIODO_INVALIDO` (400) quando `period` e `from`/`to` vêm juntos ou o rótulo é inválido.

### `GET /api/v1/closings/by-customer`
`closings:read` · paginado · `sortBy=total|pending`, `order=asc|desc`.

### `GET /api/v1/closings/periods`
`closings:read` · lista as janelas dos últimos N períodos (calculadas), com marcação de
quais têm fechamento formal.

### `POST /api/v1/closings` — **fase 2.1**
Fora do escopo desta entrega ([PD-14](31-decisoes-pendentes.md#pd-14)). Quando entrar:
`closings:create` · `{ period }` · `201` + snapshot · `409 PERIODO_JA_FECHADO`.

---

## Resumo das rotas

| Método | Rota | Permissão |
|---|---|---|
| POST | `/customers` | `customers:create` |
| GET | `/customers` | `customers:read` |
| GET | `/customers/:id` | `customers:read` |
| PATCH | `/customers/:id` | `customers:update` |
| PATCH | `/customers/:id/status` | `customers:update` |
| PATCH | `/customers/:id/credit-limit` | `customer-credit:update` |
| PATCH | `/customers/:id/credit-block` | `customer-credit:update` |
| GET | `/customers/:id/financial-summary` | `customers:read` |
| GET | `/customers/:id/status-events` | `customers:read` |
| DELETE | `/customers/:id` | `customers:delete` |
| POST | `/customers/:id/anonymize` | `customers:delete` |
| POST | `/sales` | `sales:create` (+ autorizações) |
| GET | `/sales` | `sales:read` |
| GET | `/sales/:id` | `sales:read` |
| PATCH | `/sales/:id/status` | `sales:delete` |
| GET | `/sales/:id/receipt` | `receipts:read` |
| POST | `/sales/:id/receipt/regenerate` | `receipts:read` |
| POST | `/payments` | `payments:create` |
| GET | `/payments` | `payments:read` |
| POST | `/payments/:id/reversal` | `payments:delete` |
| GET | `/sale-authorizations` | `credit-authorizations:read` |
| GET/PUT | `/companies/me/finance-settings` | `finance-settings:read` / `finance-settings:update` |
| PUT | `/companies/me/finance-settings/admin-password` | `finance-settings:update` |
| GET | `/closings/summary` | `closings:read` |
| GET | `/closings/by-customer` | `closings:read` |
| GET | `/closings/periods` | `closings:read` |
| POST | `/closings` *(fase 2.1)* | `closings:create` |
