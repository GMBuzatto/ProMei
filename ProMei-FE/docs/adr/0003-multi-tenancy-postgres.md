# ADR-0003: Multi-tenancy com banco único e coluna company_id

- Status: aceita
- Data: 2026-08-01
- Atualizada em: 2026-08-08 (implementação do Épico BE-3 — ver "Revisão")

## Contexto

SaaS atendendo muitas empresas pequenas. Opções: (a) banco por tenant, (b) schema por tenant, (c) schema compartilhado com coluna discriminadora.

## Decisão

**(c) Banco único, schema compartilhado, `company_id` em toda tabela de negócio**, com Row-Level Security do Postgres como segunda barreira.

## Justificativa

- Centenas de MEIs pequenos: banco/schema por tenant explode custo operacional (migrações, backups, conexões);
- O escopo é aplicado automaticamente pela camada de acesso a dados;
- RLS mitiga o risco de query sem filtro.

## Consequências

- Isolamento é lógico, não físico → teste automatizado de isolamento cross-tenant é obrigatório no CI;
- Cliente enterprise futuro que exija isolamento físico → revisitar esta ADR.

## Revisão (2026-08-08)

A decisão principal — banco único com `company_id` — **se mantém**. O que mudou foi o
entendimento de _como_ cada barreira funciona, depois de implementar e testar contra Postgres
real. Duas premissas do texto original não se sustentaram.

### 1. "Prisma middleware aplica o escopo automaticamente"

O client middleware (`$use`) **foi removido no Prisma 7**. A substituição é
**Client Extension** (`$extends`), aplicada uma única vez no `PrismaService`
(`src/shared/tenant/tenant.extension.ts`). O efeito prático é o mesmo, mas com três detalhes que
só aparecem na implementação:

- os models escopados ficam em **lista explícita** — model novo não entra por acidente nem fica
  de fora em silêncio;
- `findUnique` não pode receber `company_id` no `where` (só aceita campos únicos), então é
  filtrado **pelo resultado**;
- `update`/`delete` no singular recebem `WhereUniqueInput` e não aceitam `AND`, ao contrário das
  operações de coleção.

### 2. "RLS mitiga o principal risco (query sem filtro)"

**Não como estava escrito.** Para o RLS proteger contra bug da própria aplicação, o contexto de
tenant precisa estar publicado na sessão do Postgres a cada query. Com pool de conexões, isso
exige **transação por requisição**.

Tentamos e reverteu-se: com a requisição inteira em transação, uma exceção provoca rollback do
que **precisa** sobreviver a ela — a contagem de tentativas de login (RF-03) e a trilha de
auditoria são gravadas justamente quando a requisição falha. O bloqueio de conta parou de
funcionar.

Também se descobriu que o usuário criado pelo `POSTGRES_USER` do container é **superusuário**, e
superusuário ignora RLS mesmo com `FORCE ROW LEVEL SECURITY` — as policies não tinham efeito
algum, e o teste inicial passava por falso positivo.

### Como ficou

| Barreira                               | Contra o quê protege                                       |
| -------------------------------------- | ---------------------------------------------------------- |
| **Client Extension** (aplicação)       | Query sem filtro escrita na aplicação — barreira principal |
| **Guard de rota** (`PermissionsGuard`) | Usuário de plataforma acessando rota de tenant (404)       |
| **RLS + papel `promei_app`**         | Acesso **direto** ao banco: psql, BI, scripts de suporte   |

A aplicação segue conectando com o usuário privilegiado, pelo motivo do rollback acima. O papel
`promei_app` (migração `20260808130000_create_restricted_db_role`) não é superusuário e sofre
as policies — é ele que torna verdadeira a afirmação "não retorna dados de outra empresa nem via
SQL direto", e é com ele que o teste de RLS roda.

**Consequência honesta:** o RLS hoje é uma barreira contra acesso externo, **não** contra bug da
aplicação. Quem escrever query com o client cru em vez de `prisma.db` fura o escopo sem que o
banco impeça. Isso torna o teste de isolamento cross-tenant no CI ainda mais importante do que a
versão original desta ADR sugeria.

### Caminho para endurecer

Se no futuro a proteção contra bug interno da aplicação for considerada necessária:

1. mover a aplicação para o papel `promei_app`;
2. abrir transação com o contexto de tenant nas operações de dados de negócio (o helper
   `PrismaService.withTenantSession` já existe para isso);
3. tratar separadamente o que precisa persistir após erro — auditoria e contagem de tentativas —
   usando uma conexão fora da transação.

O passo 3 é o que inviabilizou fazer isso agora, e é onde está o trabalho real.
