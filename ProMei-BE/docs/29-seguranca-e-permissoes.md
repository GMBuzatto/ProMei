# Segurança e permissões — fase 2

> Base: [09](09-seguranca.md) · [ADR-0003](adr/0003-multi-tenancy-postgres.md) ·
> [ADR-0005](adr/0005-permissions-jwt-with-db-validation.md)

A fase 2 introduz o primeiro dado **financeiro** do produto. O risco muda de natureza: até
aqui, um vazamento cross-tenant expunha catálogo e saldo de estoque; a partir daqui, expõe
quanto cada pessoa deve, para quem, e há quanto tempo.

## Isolamento por empresa

Nenhuma barreira nova é inventada. As três existentes ganham as tabelas novas:

| Barreira | O que muda na fase 2 |
|---|---|
| **Client Extension** (principal) | 8 models novos em `TENANT_SCOPED_MODELS` |
| **Guard de rota** | Todas as rotas novas são de tenant; usuário de plataforma recebe 404 |
| **RLS + papel `promei_app`** | Uma policy por tabela nova |

E uma quarta, específica desta fase:

**FK composta com o tenant.** `sales.(customer_id, company_id) → customers.(id, company_id)`
e equivalentes. É a barreira que pega o caso que nenhuma das outras pega: a aplicação, com o
escopo funcionando corretamente, criando uma venda que aponta para o cliente errado porque
um `customerId` de outra empresa veio no corpo da requisição. A Client Extension escopa o
`INSERT` (grava `company_id` certo) mas não valida a FK; o RLS não é aplicado à aplicação
(revisão da ADR-0003). O banco valida. Detalhe em
[27](27-modelo-de-dados.md#sale_items).

### IDOR

Todo identificador nas rotas novas é UUID e todo acesso é escopado. As regras:

- `companyId` **nunca** é aceito em corpo, query ou path. Vem do JWT. Rota de configuração
  usa o literal `me` (`/companies/me/finance-settings`), sem id;
- recurso de outra empresa devolve **404 `RECURSO_NAO_ENCONTRADO`**, nunca 403 — 403
  confirmaria a existência do recurso, e "existe uma venda com esse id" já é informação;
- ids em corpo aninhado (`items[].itemId`, `saleId`, `customerId`) são resolvidos **com
  escopo** dentro da mesma transação, nunca por `findUnique` cru. `findUnique` é o caso em
  que a Client Extension filtra pelo **resultado**, não pelo `where` — comportamento
  documentado na ADR-0003 e que só funciona se o service não olhar o objeto antes;
- o teste de isolamento cross-tenant do CI passa a incluir, para cada rota nova, a
  tentativa da empresa B contra o recurso da empresa A.

## Autenticação e autorização

Sem mudança de mecanismo: JWT access 15 min + refresh rotacionado, `PermissionsGuard`
validando contra o banco a cada request (ADR-0005), `SubscriptionAccessGuard` aplicando a
tabela de decisão de acesso.

Uma consequência da tabela de decisão que precisa estar escrita: **empresa inadimplente
(assinatura `PAST_DUE`) não registra venda nem recebimento** — são `POST`, e a tabela de
docs/04 nega escrita. Ela continua consultando clientes, vendas e o fechamento. Isso é
coerente e deve ser testado explicitamente ([30](30-testes.md)), porque é um caso em que o
usuário vai reclamar e alguém vai querer "abrir uma exceção" — que não deve existir.

## Recursos e permissões

Adicionar ao catálogo em `src/shared/access/permission-catalog.ts`:

```ts
export const PERMISSION_RESOURCES = [
  // existentes
  'companies', 'users', 'roles', 'permissions', 'plans', 'subscriptions',
  'items', 'stock-movements', 'receipts', 'audit-logs',
  // fase 2
  'customers', 'customer-credit', 'sales', 'payments',
  'credit-authorizations',
  'closings', 'finance-settings',
] as const;
```

`PERMISSION_ACTIONS` permanece `['create','read','update','delete']`. **Não** é estendido
com `authorize`/`cancel`, por dois motivos: o catálogo é o produto cartesiano
`recurso × ação`, então uma ação nova cria pares sem sentido em todos os recursos
(`companies:authorize`); e o formato `recurso:ação` está gravado no JWT, no guard, no front
e na ADR-0005.

O preço dessa escolha é o mapeamento semântico, que precisa estar documentado no código
onde a permissão é declarada:

| Permissão | Significa |
|---|---|
| `sales:delete` | **Cancelar** venda (venda nunca é excluída) |
| `payments:delete` | **Estornar** recebimento |
| `credit-authorizations:create` | Liberar venda bloqueada por crédito (o único tipo, [PD-01](31-decisoes-pendentes.md#pd-01)) |
| `customers:update` | Editar cadastro (**não** dá crédito) |
| `customer-credit:update` | Alterar limite mensal e bloquear/desbloquear crédito |
| `closings:create` | Fechar formalmente um período |

Pares que existem no catálogo mas nunca são concedidos (`credit-authorizations:update`,
`customer-credit:delete`, `closings:delete`) seguem o precedente do MVP, que já tem
`permissions:create` sem uso.

### Separação de crédito

`PATCH /customers/:id/credit-limit` e `/credit-block` **não** usam `customers:update`.
Decisão em [PD-16](31-decisoes-pendentes.md#pd-16): a mesma permissão cobrindo "corrigir o
telefone" e "dar R$ 5.000 de crédito" é grossa demais, e resolver isso por convenção (papel
customizado) deixaria a separação sem garantia.

O recurso `customer-credit` custa uma linha no catálogo e torna possível, de forma explícita,
um papel que edita cadastro sem poder dar crédito. As duas rotas também são marcadas como
sensíveis: auditoria com `diff` completo e rate limit próprio.

## Matriz de permissões

Papéis do projeto: **Admin** e **Colaborador** são de sistema (`is_system = true`), criados
em toda empresa nova por `default-company-roles.ts`. **Gerente** não existe hoje — é um
papel **customizado** (RF-12) e entra aqui como exemplo do que o Admin monta.

| Ação | Colaborador | Gerente (customizado) | Admin | Super Admin |
|---|---|---|---|---|
| Consultar clientes | ✅ | ✅ | ✅ | ❌ |
| Cadastrar cliente | ✅ | ✅ | ✅ | ❌ |
| Editar cliente | ❌ | ✅ | ✅ | ❌ |
| Inativar/excluir cliente | ❌ | ❌ | ✅ | ❌ |
| Anonimizar cliente a pedido do titular (`customers:delete`, LGPD) | ❌ | ❌ | ✅ | ❌ |
| Alterar limite mensal (`customer-credit:update`) | ❌ | ❌ | ✅ | ❌ |
| Bloquear/desbloquear crédito (`customer-credit:update`) | ❌ | ✅ | ✅ | ❌ |
| Criar venda à vista | ✅ | ✅ | ✅ | ❌ |
| Criar venda a prazo | ✅ | ✅ | ✅ | ❌ |
| Consultar vendas | ✅ | ✅ | ✅ | ❌ |
| Cancelar venda | ❌ | ✅ | ✅ | ❌ |
| Registrar recebimento | ✅ | ✅ | ✅ | ❌ |
| Estornar recebimento | ❌ | ✅ | ✅ | ❌ |
| Liberar crédito | ❌ | ✅ | ✅ | ❌ |
| Definir senha administrativa | ❌ | ❌ | ✅ | ❌ |
| Configurar fechamento e prazos (`finance-settings`) | ❌ | ❌ | ✅ | ❌ |
| Consultar fechamento | ❌ | ✅ | ✅ | ❌ |
| Fechar período | ❌ | ❌ | ✅ | ❌ |
| Consultar liberações | ❌ | ✅ | ✅ | ❌ |
| Consultar trilha de auditoria | ❌ | ❌ | ✅ | ❌ |

**Super Admin/Staff não acessa nada disso.** Todas as rotas da fase 2 são de tenant, e o
`PermissionsGuard` devolve 404 para usuário sem `company_id` (RN-05). Isso é
intencional: a equipe da plataforma administra assinaturas, não a carteira de clientes de
um MEI. Suporte que precisar investigar usa a trilha de auditoria e o banco, com o papel
restrito.

Colaborador **vende mas não perdoa**: registra venda e recebimento, não cancela, não
estorna, não libera, não vê o fechamento. É o recorte que espelha o Colaborador atual, que
movimenta estoque e não administra catálogo.

### Papéis de sistema

```ts
// src/shared/access/default-company-roles.ts
export const ADMIN_FULL_RESOURCES = [
  'users', 'roles', 'items', 'stock-movements', 'receipts',
  'customers', 'customer-credit', 'sales', 'payments',
  'credit-authorizations', 'closings', 'finance-settings',
] as const;

export const ADMIN_READ_ONLY_RESOURCES = ['audit-logs'] as const;

export const COLLABORATOR_PERMISSIONS = [
  { resource: 'items',            actions: ['read'] },
  { resource: 'stock-movements',  actions: ['create', 'read'] },
  { resource: 'receipts',         actions: ['read'] },
  { resource: 'customers',        actions: ['create', 'read'] },
  { resource: 'sales',            actions: ['create', 'read'] },
  { resource: 'payments',         actions: ['create', 'read'] },
] as const;
```

Note o `finance-settings` no catálogo. A configuração financeira fica sob `/companies/me/…`,
mas **não** usa `companies:*`: `companies` é recurso de plataforma e o Admin de empresa não o
possui (RN-01/RN-05). Abrir `companies` para o tenant só para essa tela daria ao Admin uma
permissão cujo nome sugere administrar empresas. Recurso próprio é mais barato e mais
honesto.

Empresa criada por seed e por API precisa nascer idêntica — o arquivo já avisa disso, e vale
para a fase 2.

## A senha administrativa

Detalhe funcional em [24](24-liberacoes-administrativas.md#a-senha-administrativa). Do ponto
de vista de segurança:

| Requisito | Como |
|---|---|
| Hash seguro | argon2id, mesma configuração das senhas de usuário |
| Nunca em texto puro | Só existe em memória durante o `argon2.verify` |
| Nunca em log | Campo na lista de redação do Pino, junto com `password` e tokens |
| Nunca em histórico | `audit_logs.diff` da liberação nunca inclui o campo; revisão de código obrigatória no PR |
| Nunca em resposta | Nem no `GET` de finance-settings, nem em erro |
| Nunca em URL | Só em corpo de `POST`/`PUT` |
| Força mínima | Mesma política das senhas de usuário |
| Brute force | Rate limit por rota + lockout progressivo por empresa + auditoria de falha |
| Comparação | `argon2.verify` (tempo constante); nunca `===` |

Ameaça específica: como a senha é da **empresa**, uma tentativa de força bruta afeta todos
os operadores (o lockout é por empresa). Um colaborador malicioso poderia travar as
liberações do balcão inteiro errando a senha cinco vezes. Mitigação: o lockout **não**
bloqueia vendas normais, só liberações; a falha é auditada com autor; e o rate limit é
por usuário antes de ser por empresa. Registrado em
[PD-13](31-decisoes-pendentes.md#pd-13).

## Exposição de dados financeiros

- **Logs**: `company_id`, `user_id` e `correlation_id` continuam nos logs estruturados
  (docs/13). Valores monetários, nome, documento, telefone e e-mail de cliente **não** vão
  para log de request. Um erro de venda loga `saleId` e os códigos de bloqueio, não os
  números;
- **Sentry**: 4xx de negócio não sobe (já é assim). Os 5xx que subirem levam
  `correlation_id`, não payload. `beforeSend` deve scrubar `password`, `document`, `amount`
  e `total` — vale ampliar a configuração existente;
- **Comprovante em PDF**: passa a conter nome do cliente. O arquivo fica em
  `RECEIPT_STORAGE_DIR` (disco no MVP) e o download já é autenticado e escopado. Ao migrar
  para S3-compatível (docs/07), **nada de bucket público**: URL assinada de curta duração;
- **LGPD** (docs/09): cliente é titular de dados pessoais e o produto passa a guardar mais
  do que guardava. Consequências: cliente entra na exportação e na exclusão sob demanda; a
  exclusão de cliente com histórico é **anonimização**, decidida em
  [PD-17](31-decisoes-pendentes.md#pd-17): nome → "Cliente removido",
  documento/e-mail/telefone/endereço → `NULL`, `anonymized_at` preenchido e cliente passa a
  `INACTIVE`; vendas, pagamentos e movimentações permanecem. Apagar a venda destruiria a
  contabilidade da empresa, cuja base legal de retenção é distinta da do cadastro. **A
  redação final precisa de validação jurídica antes de ir a produção.**

## Threat model — o que a fase 2 acrescenta

| Ameaça | Vetor | Mitigação |
|---|---|---|
| Venda para cliente de outra empresa | `customerId` forjado no corpo | FK composta com tenant + escopo na resolução |
| Leitura de carteira alheia | id de venda/cliente de outra empresa | Escopo automático + RLS + 404 |
| Liberação sem autorização | Chamada direta ao endpoint com `authorization` inventado | Senha argon2 + permissão + revalidação sob lock |
| Vender sem estoque | `authorization` cobrindo `INSUFFICIENT_STOCK` | Motivo não liberável + `CHECK (stock >= 0)` no banco |
| Força bruta na senha administrativa | Repetição de `POST /sales` | Rate limit + lockout progressivo + auditoria |
| Colaborador perdoando dívida | Cancelar venda ou estornar recebimento | Permissões separadas, negadas ao Colaborador; motivo obrigatório; auditoria |
| Contornar limite | Comprar, cancelar, recomprar | Cancelamento auditado, permissão restrita, linha própria no fechamento ([PD-02](31-decisoes-pendentes.md#pd-02)) |
| Venda duplicada por retry | Duplo clique / rede instável | Transação única + (opcional) `Idempotency-Key` ([PD-12](31-decisoes-pendentes.md#pd-12)) |
| Estoque estourado por concorrência | Vendas simultâneas | `FOR UPDATE` ordenado por id |
| Limite estourado por concorrência | Vendas simultâneas do mesmo cliente | `pg_advisory_xact_lock(customer_id)` |
| Adulteração de valor histórico | Editar preço do item | Cópia de preço/nome/SKU em `sale_items` |
| Apagar rastro de exceção | Cancelar venda liberada | `sale_authorizations` permanece; fechamento conta separado |
| Vazamento de dado pessoal em log | Log de payload de venda | Lista de redação + revisão de PR |

## Checklist de PR da fase 2

Para cada PR que toca as rotas novas:

- [ ] Model novo está em `TENANT_SCOPED_MODELS`?
- [ ] Tabela nova tem policy de RLS e entra no teste de RLS?
- [ ] Rota é de tenant (sem `@PlatformRoute`) e declara `@RequirePermission`?
- [ ] Nenhum `companyId` vindo de corpo/query/path?
- [ ] Nenhum `findUnique` cru usado para resolver id externo?
- [ ] FK composta com tenant onde há referência entre tabelas de negócio?
- [ ] Escrita crítica dentro de transação, com a ordem de lock documentada?
- [ ] Auditoria fora da transação?
- [ ] Nada sensível em log, resposta ou `audit_logs.diff`?
- [ ] Valor pré-configurável em env, não em constante (docs/16)?
- [ ] Teste de isolamento cross-tenant cobrindo a rota nova?
