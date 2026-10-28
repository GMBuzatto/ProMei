<div align="center">

<img src="../ProMei-FE/public/icon.png" alt="ProMei" width="96" />

# ProMei — Back-end (API)

**API REST multi-tenant do ProMei, SaaS de gestão comercial para MEIs.**

![Node](https://img.shields.io/badge/Node-22_LTS-5FA04E?logo=nodedotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)

[**Documentação**](docs/README.md) · [**Arquitetura**](docs/06-arquitetura.md) · [**Padrões**](docs/08-padroes-de-desenvolvimento.md) · [**Segurança**](docs/09-seguranca.md) · [**ADRs**](docs/adr/) · [**Painel (ProMei-FE)**](../ProMei-FE/README.md)

</div>

---

<details>
<summary><b>📑 Sumário</b></summary>

- [Estrutura](#-estrutura)
- [Rodando localmente](#-rodando-localmente)
- [Prisma 7](#-prisma-7)
- [Observabilidade](#-observabilidade)
- [Autorização e multi-tenancy](#-autorização-e-multi-tenancy)
- [Trilha de auditoria (RNF-06)](#-trilha-de-auditoria-rnf-06)
- [Health checks](#-health-checks)
- [Scripts](#-scripts)
- [Provisionamento de empresa](#-provisionamento-de-empresa)
- [Pipeline e proteção de branch](#-pipeline-e-proteção-de-branch)
- [Convenções essenciais](#-convenções-essenciais)

</details>

## 📁 Estrutura

```
src/
├── modules/            # domínios de negócio
│   ├── auth/           # login, JWT, refresh
│   ├── users/          # usuários por empresa
│   ├── permissions/    # papéis e permissões (recurso:ação)
│   ├── companies/      # tenants (empresas)
│   ├── subscriptions/  # planos e assinaturas
│   ├── items/          # CRUD de itens
│   ├── inventory/      # movimentações de estoque + comprovantes
│   └── audit/          # trilha de auditoria
│   └── health/         # health check (/api/v1/health)
├── shared/
│   ├── guards/         # auth + permissão
│   ├── interceptors/   # correlation id
│   ├── filters/        # tratamento global de erros
│   ├── errors/         # exceptions de negócio tipadas
│   ├── logging/        # Pino (logs JSON + correlation id)
│   ├── decorators/
│   ├── tenant/         # escopo multi-tenant (middleware Prisma)
│   └── config/         # env validada no boot (zod)
prisma/                 # schema + migrações
test/
├── unit/
└── integration/        # Supertest + testcontainers (inclui teste de isolamento cross-tenant)
```

## 🚀 Rodando localmente

Requisitos: **Node 22 LTS** e **pnpm 11** (`npm i -g pnpm`).

> [!WARNING]
> Use **pnpm**, não npm. Só o `pnpm-lock.yaml` é versionado; instalar com npm gera um
> `package-lock.json` divergente e pode duplicar dependências.

```bash
pnpm install
cp .env.example .env      # ajuste as variáveis (segredos JWT: mín. 16 caracteres)
docker compose up -d db   # Postgres 16 em 127.0.0.1:55432
pnpm db:migrate           # aplica as migrações
pnpm db:seed              # dados de exemplo (opcional)
pnpm start:dev            # http://localhost:3001/api/v1
```

> [!NOTE]
> A porta **55432** foi escolhida para não disputar com instalações nativas do Postgres, que
> costumam ocupar 5432/5433. Se `pnpm db:migrate` falhar com `P1000`/`P1010`, confira qual
> processo responde na porta: `Get-NetTCPConnection -LocalPort 55432 -State Listen`.

## 💾 Prisma 7

O projeto usa **Prisma 7** (cliente sem Rust). Quatro diferenças importam no dia a dia:

**O client é gerado, não instalado.** Ele sai em `src/generated/prisma/`, que está no
`.gitignore` — não vem no clone nem no `node_modules`. O `postinstall` roda `prisma generate`
automaticamente, então `pnpm install` já resolve. Se aparecer erro de import do client, rode
`pnpm db:generate`.

**Importe do caminho gerado**, nunca de `@prisma/client`:

```ts
import { PrismaClient } from '../../generated/prisma/client';
```

**A connection string vive em `prisma.config.ts`**, não no `datasource` do schema. E o Prisma
não carrega mais o `.env` sozinho — quem faz isso é o `import 'dotenv/config'` no topo daquele
arquivo. O client em runtime recebe a URL via driver adapter (`@prisma/adapter-pg`) no
`PrismaService`.

**Migrações não geram mais o client nem rodam o seed.** O script `db:migrate` já encadeia o
`prisma generate`; o seed é sempre explícito com `pnpm db:seed`.

> [!IMPORTANT]
> Para o escopo multi-tenant, use **Client Extensions** (`$extends`). O antigo `$use`
> (middleware) foi removido na v7 — ver [docs/06-arquitetura.md](docs/06-arquitetura.md).

## 📊 Observabilidade

### Correlation id

Toda requisição carrega um `x-correlation-id`. Se o cliente mandar o header, ele é reaproveitado;
senão é gerado um UUID. **O id nasce em um único lugar** — o `genReqId` do `FastifyAdapter`, em
`main.ts` — e é lido de `request.id` pelo logger, pelo interceptor e pelo filtro de erros. Isso
garante que o id do log, o do header de resposta e o do corpo do erro sejam sempre o mesmo valor.

> [!CAUTION]
> Cuidado ao mexer: definir `genReqId` no `pino-http` **não funciona**. O Fastify já preencheu
> `request.id` (com um contador `req-1`, `req-2`…) quando o Pino roda, e o header do cliente
> seria descartado.

### Logs

JSON via Pino, com os campos do docs/13 em `snake_case`:

```json
{
  "level": 30,
  "correlation_id": "6a161993-40e0-45df-b238-ca4c8ccc6f92",
  "req": { "method": "GET", "url": "/api/v1/health" },
  "res": { "statusCode": 200 },
  "responseTime": 2
}
```

`company_id` e `user_id` entram automaticamente assim que houver usuário autenticado no request.
`authorization`, `cookie`, `password`, `token` e afins são removidos antes de logar.

Em desenvolvimento a saída é formatada por `pino-pretty`; em produção é JSON puro.

## 🔐 Autorização e multi-tenancy

Risco nº 1 do produto (docs/09). Há **duas** barreiras na aplicação, mais o RLS no banco.

### Guard de permissão (RF-13)

Toda rota declara o que exige. O guard é global, então o default é fechado:

```ts
@RequirePermission('items:create')   // exige a permissão recurso:ação → 403 se faltar
@PlatformRoute()                     // só Super Admin/Staff (sem company_id)
@AnyAuthenticated()                  // qualquer autenticado; use com parcimônia
@Public()                            // sem autenticação
```

Uma rota **sem** `@PlatformRoute` nem `@AnyAuthenticated` é de tenant: usuário de plataforma
recebe **404**. Isso é deliberado — esquecer o decorator fecha a rota em vez de abrir, e 404
(não 403) evita revelar que o recurso existe.

Super Admin dispensa a checagem de permissão (RN-01). Staff passa pelo fluxo normal.

As permissões vêm do **banco**, não do token, com cache de 60s: revogar uma permissão faz
efeito quase imediato, sem esperar o access token expirar. Ao mexer em papéis, chame
`PermissionsService.invalidateCache()`.

> [!IMPORTANT]
> **Autorização é sempre por permissão, nunca por nome de papel.**
>
> Existiu um `@Roles('Admin')` no projeto e ele foi **removido** de propósito. Amarrar rota a
> nome de papel quebra o RF-12: o cliente cria papéis customizados, e um papel novo jamais
> passaria por `@Roles('Admin')` por mais permissões que tivesse. Se você precisa restringir
> algo, declare a permissão — e crie a permissão no seed se ela ainda não existir.

### Tabela de decisão de acesso (docs/04)

Além da permissão, cada requisição de usuário de empresa passa pela tabela de decisão:

| Empresa   | Assinatura   | Login | Escrita | Leitura |
| --------- | ------------ | ----- | ------- | ------- |
| ativa     | trial/ativa  | ✅    | ✅      | ✅      |
| ativa     | inadimplente | ✅    | ❌      | ✅      |
| suspensa  | qualquer     | ❌    | ❌      | ❌      |
| cancelada | qualquer     | ❌    | ❌      | ❌      |

A regra vive em `src/shared/access/access-policy.ts` como **função pura** — é a decisão que
define quem consegue usar o produto, e precisa ser legível sem banco nem HTTP. Ela é aplicada em
dois lugares: no login (`AuthService`) e no `SubscriptionAccessGuard`, que bloqueia métodos de
escrita quando a assinatura está inadimplente.

Empresa **sem assinatura** tem acesso normal: ausência de vínculo é estado transitório de
provisionamento, não inadimplência. Para cortar acesso, suspenda a empresa ou marque a assinatura
como inadimplente — os dois casos estão na tabela.

Usuário de plataforma não passa por essa tabela — ele não pertence a empresa nenhuma (RN-05) e é
justamente quem administra esses estados. Ao mudar estado de empresa ou assinatura, chame
`SubscriptionAccessGuard.invalidate(companyId)`.

### Escopo de tenant

O `PrismaService` expõe duas coisas:

| Uso             | Quando                                                            |
| --------------- | ----------------------------------------------------------------- |
| `prisma.scoped` | **Padrão.** Client Extension injeta `company_id` em toda query    |
| `prisma` (cru)  | Só onde o escopo não se aplica: login por e-mail, seed, migrações |

Regras da extension (`src/shared/tenant/tenant.extension.ts`):

- os models escopados estão em uma **lista explícita** — model novo não entra por acidente nem
  fica de fora em silêncio; quem adicionar tabela de negócio decide ali, e o teste de isolamento
  cobra;
- o escopo entra como **`AND`** no `where`, não sobrescrevendo: pedir dados de outra empresa vira
  condição impossível e devolve **vazio**, em vez de devolver os da própria empresa — sobrescrever
  seria igualmente seguro, mas mascararia bug de aplicação;
- `findUnique` é filtrado pelo **resultado**, não pelo `where`: o Prisma só aceita campos únicos
  em `findUnique` e `company_id` não é único;
- `upsert` recebe escopo apenas no `create`, pela mesma restrição de campo único. O `where` dele
  deve usar a chave composta que já inclui a empresa (ex.: `companyId_sku`);
- sem contexto de requisição (seed, login antes de autenticar) não há filtro;
- usuário de plataforma não sofre filtro — por isso a fronteira de rota acima é essencial.

O contexto vem de `AsyncLocalStorage`, aberto por um middleware e preenchido pelo `JwtAuthGuard`.
Middleware e não interceptor porque precisa envolver os guards.

### Erros

O filtro global converte qualquer exceção em `{ statusCode, code, message, correlationId }`. Erros
`5xx` têm a mensagem **substituída** por "Erro interno do servidor" — inclusive quando lançados
como `HttpException`, já que a mensagem original pode conter SQL, IP ou caminho de arquivo. O
stack trace vai para o log e para o Sentry, nunca para a resposta.

`4xx` de negócio não vão ao Sentry: são esperados.

### Sentry

Configure `SENTRY_DSN` (e opcionalmente `SENTRY_RELEASE`, use o SHA do commit no deploy). Sem DSN
o serviço fica inativo sem quebrar nada — o normal em desenvolvimento. Em produção sem DSN, um
aviso é registrado no boot. Cada evento vai com o `correlation_id` como tag, permitindo cruzar o
erro no Sentry com a linha no log.

## 📜 Trilha de auditoria (RNF-06)

A tabela `audit_logs` responde "quem fez o quê, quando, em qual empresa, de qual IP"
([docs/09-seguranca.md](docs/09-seguranca.md)). Cada registro guarda `action`, `resource`,
`user_id` (autor), `company_id`, `diff` e `ip`.

O que é registrado hoje:

| Origem            | Ações                                                                |
| ----------------- | -------------------------------------------------------------------- |
| Autenticação      | `login.success`, `login.failed`, `login.locked`, `logout`, `token.*` |
| Senha (RF-04)     | `password.changed`, `password.reset.*`                               |
| Usuários e papéis | `user.*`, `role.*`                                                   |
| Plataforma        | `company.*`, `plan.*`, `subscription.*`                              |
| Estoque           | `item.*`, `stock-movement.created`, `receipt.*`                      |

Em alteração, o `diff` guarda **antes e depois** — a trilha precisa responder "o que mudou", não
apenas "algo mudou".

### Append-only é garantido pelo banco, não por convenção

A migração `20260812100000_audit_logs_append_only` instala um trigger que faz `UPDATE` em
`audit_logs` levantar exceção. Não é o service que se comporta bem: é o Postgres que recusa —
inclusive para quem chega por `psql`. É o que torna a palavra "append-only" verificável, e o
teste `test/integration/audit-trail.integration.spec.ts` prova isso tentando adulterar um
registro.

**`DELETE` continua permitido**, de propósito: a LGPD exige expurgo após a retenção de 90 dias, e
os testes precisam limpar a tabela entre cenários. Bloquear o `DELETE` significaria carregar uma
tabela que só cresce, sem forma prevista de aparar.

### Auditoria fica fora de transação

Onde há transação de negócio (movimentação de estoque, por exemplo), o `audit.log` é chamado
**depois** dela. O motivo é o mesmo que fez a transação-por-requisição ser revertida no BE-3
(ver [ADR-0003](docs/adr/0003-multi-tenancy-postgres.md)): o registro de uma falha precisa
sobreviver ao rollback que a falha provoca. Auditoria que some junto com o erro não audita nada.

### Consulta

`GET /api/v1/audit-logs` exige a permissão `audit-logs:read`. É rota de tenant e usa
`prisma.db`, então o Admin de uma empresa enxerga apenas a trilha dela. Filtros: `action`,
`resource`, `userId`, `from`, `to`, mais a paginação padrão. Ordenada do mais recente para o mais
antigo, que é como se investiga um incidente. **Não há rota de escrita nem de exclusão.**

## 🩺 Health checks

Conforme [docs/13-observabilidade.md](docs/13-observabilidade.md):

| Endpoint               | O que verifica                            | Respostas                      |
| ---------------------- | ----------------------------------------- | ------------------------------ |
| `/api/v1/health`       | Processo vivo. Não toca em dependências.  | `200`                          |
| `/api/v1/health/ready` | Banco acessível **e** migrações aplicadas | `200` pronto · `503` degradado |

```bash
curl -i http://localhost:3001/api/v1/health/ready
```

O corpo detalha cada check, o que permite distinguir banco fora de migração pendente:

```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latencyMs": 20 },
    "migrations": { "status": "ok", "applied": 1, "pending": [], "failed": [] }
  }
}
```

Decisão de projeto: falha de conexão no boot **não derruba a API**. O processo sobe degradado e
o readiness responde `503` até o banco voltar — se o processo morresse, não sobraria ninguém
para responder o health check.

## 🧰 Scripts

| Script                              | O que faz                                     |
| ----------------------------------- | --------------------------------------------- |
| `pnpm start:dev`                    | Sobe a API em watch mode (adapter Fastify)    |
| `pnpm build` / `pnpm start:prod`    | Compila para `dist/` e roda o build           |
| `pnpm lint` / `pnpm lint:fix`       | ESLint (flat config + typed rules + Prettier) |
| `pnpm typecheck`                    | `tsc --noEmit` com `strict: true`             |
| `pnpm format` / `pnpm format:check` | Prettier                                      |
| `pnpm test` / `pnpm test:cov`       | Vitest (unit) e cobertura                     |

### Smoke test de fluxo

`scripts/smoke-test.sh` percorre o caminho do cliente contra um ambiente já no ar: login → item →
entrada → saída → recusa de saldo insuficiente → PDF do comprovante → auditoria. Roda nos
workflows de staging, produção e rollback, **depois** do poll de liveness em `/health/ready`.

A distinção importa: o poll prova que o processo subiu; só o smoke de fluxo prova que dá para usar
o produto. Um deploy passa no primeiro com a autenticação quebrada.

```bash
BASE_URL=https://staging.exemplo/api/v1 \
SMOKE_ADMIN_EMAIL=smoke@... SMOKE_ADMIN_PASSWORD='...' \
scripts/smoke-test.sh
```

Roteiro completo e a empresa de smoke que ele usa: [docs/15-go-live.md](docs/15-go-live.md).

## 🏢 Provisionamento de empresa

`POST /companies` **provisiona** (RF-20), numa transação: empresa + papéis Admin e Colaborador com
suas permissões (RF-11) + primeiro usuário admin + assinatura, se vier `planId`.

O admin inicial é obrigatório no corpo. Antes ele era opcional na prática — o `POST` criava só a
linha em `companies`, e nenhuma rota conseguia criar o primeiro usuário dela, porque `POST /users`
e `POST /roles` são de tenant e o Super Admin leva 404 na fronteira do guard. A empresa nascia
inacessível e só saía desse estado por acesso direto ao banco.

As permissões dos dois papéis vivem em `src/shared/access/default-company-roles.ts`, importado
tanto pelo service quanto pelo `prisma/seed.ts`: empresa criada por API e por seed precisa nascer
idêntica, senão o comportamento diverge entre desenvolvimento e produção.

## 🔄 Pipeline e proteção de branch

Fluxo: `feat/*` → **`development`** → **`staging`** → **`main`**. As três são protegidas: só entra
por PR, sem push direto e sem force-push, merge por squash.

`.github/workflows/ci.yml` roda quatro jobs em paralelo em todo PR, e os quatro são
_required status checks_ — se qualquer um falhar, o merge fica bloqueado:

| Job     | O que roda                                             |
| ------- | ------------------------------------------------------ |
| `lint`  | `format:check`, `lint`, `typecheck`                    |
| `test`  | `pnpm test`                                            |
| `audit` | `pnpm audit --audit-level critical` (bloqueia crítica) |
| `build` | `pnpm build`                                           |

A proteção das branches está versionada em `.github/rulesets/*.json`. Para aplicar ou
reaplicar no GitHub (precisa do [GitHub CLI](https://cli.github.com) autenticado como admin):

```powershell
pwsh ./scripts/setup-branch-protection.ps1   # ou ./scripts/setup-branch-protection.sh
```

> [!WARNING]
> **Pendência:** os rulesets ainda **não estão ativos** — o repositório é privado no plano Free
> e o GitHub responde `403`. Até isso ser resolvido, nada impede merge com check vermelho ou
> push direto na `main`. Detalhes e opções em
> [docs/11-infra-ci-cd.md](docs/11-infra-ci-cd.md).

Paliativo local, contornável mas útil no dia a dia:

```bash
pnpm hooks:install   # já roda sozinho no pnpm install
```

`.githooks/pre-push` bloqueia push direto nas branches protegidas e roda os mesmos gates do CI
antes do push. Em emergência: `PUSH_SEM_GATE=1 git push`.

## 📐 Convenções essenciais

- Toda rota valida permissão **e** escopo de tenant — nenhuma query sem `company_id`;
- Erros no formato `{ statusCode, code, message, correlationId }`;
- API versionada: `/api/v1`;
- Migrações só via Prisma Migrate; Conventional Commits; PR obrigatório para `main`;
- `fastify` está pinado na **versão exata** exigida pelo `@nestjs/platform-fastify`. Duas versões
  diferentes geram duas cópias na árvore de dependências e quebram os tipos (`TS2345` em
  `app.register`). Ao atualizar o `@nestjs/platform-fastify`, alinhe as duas versões.
