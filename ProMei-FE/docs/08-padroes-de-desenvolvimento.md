# Padrões de Desenvolvimento — ProMei FE

## Estrutura de repositório

Multi-repo ([ADR-0004](adr/0004-multi-repo.md)): `ProMei-BE` (API NestJS) e `ProMei-FE` (painel Next.js), cada um com seu próprio README, CI e versionamento. `docs/` acompanha o projeto como fonte de verdade compartilhada.

### ProMei-BE (por módulo de domínio)

```
src/
├── modules/
│   ├── auth/
│   ├── companies/
│   ├── items/
│   └── inventory/
│       ├── inventory.controller.ts
│       ├── inventory.service.ts
│       ├── dto/
│       └── inventory.module.ts
├── shared/           # guards, interceptors, filters, tenant
└── main.ts
```

### ProMei-FE (por feature)

```
src/
├── app/                  # rotas (App Router) — páginas FINAS: metadata + composição
│   ├── (auth)/           # login, troca de senha obrigatória
│   └── (dashboard)/      # rotas autenticadas (AuthGuard no layout do grupo)
├── features/<domínio>/   # api.ts (chamadas), hooks.ts (TanStack Query), schemas.ts (zod),
│   └── components/       # types.ts, lógica pura testável e componentes da feature
├── components/           # compartilhados: ui/ (shadcn), layout/, ApiErrorAlert,
│                         # ListEmptyState, TableSkeletonRows, providers
├── lib/                  # api/ (client HTTP, ApiError, sessão), env.ts, query-client.ts,
│                         # pagination.ts, routes.ts, utils
├── hooks/                # hooks genéricos (sem domínio)
├── styles/               # globals.css — tokens/CSS variables (tema + nicho)
└── types/                # contratos HTTP repetidos em todo módulo (ex.: PaginatedResult)
test/                     # testes unitários (Vitest), espelhando a árvore de src/
```

Testes ficam em `test/`, replicando o caminho do módulo testado (`src/features/auth/permissions.ts`
→ `test/features/auth/permissions.test.ts`) e importando sempre pelo alias `@/`.

Regras que amarram essa estrutura (detalhes em [16](16-configuracao-sem-hardcode.md),
[17](17-camada-de-dados.md) e [styles/](styles/DESIGN-SYSTEM.md)):

- Página em `app/` não tem lógica: importa componentes de `features/` e declara metadata;
- Toda chamada HTTP passa por `@/lib/api` — nunca `fetch` direto em componente/hook; toda
  query repassa o `signal` do TanStack Query para a função de `api.ts`;
- Config por env validada em `lib/env.ts`; valores visuais só por token semântico;
- Erro exibido com `<ApiErrorAlert/>`; loading/empty de listagem com `TableSkeletonRows`/
  `ListEmptyState`; tamanho de página via `lib/pagination.ts`;
- Validação/permissão no front é UX — a API é a autoridade.

## Nomenclatura

- Arquivos: `kebab-case`; classes: `PascalCase`; variáveis/funções: `camelCase`;
- Tabelas: `snake_case` plural (`stock_movements`); colunas: `snake_case`;
- Rotas REST: substantivos no plural, kebab-case (`/stock-movements`);
- Código e identificadores em **inglês**; UI e docs em **pt-BR**.

## API

- REST, versionada por prefixo: `/api/v1/...`;
- Respostas de erro padronizadas: `{ statusCode, code, message, correlationId }` com códigos de negócio (`ESTOQUE_INSUFICIENTE`, `LIMITE_PLANO_EXCEDIDO`);
- Validação de entrada com zod/class-validator em todo endpoint — nunca confiar no front;
- Paginação padrão: `?page=&limit=` (limit máx. 100).

## Tratamento de erros

- Exceptions de negócio tipadas → filter global converte para o formato padrão;
- Nunca vazar stack trace ou SQL em resposta;
- Todo erro 5xx é logado com correlation id e enviado ao Sentry.

## Configuração e secrets

- Configuração por variável de ambiente, validada no boot (zod) — app não sobe com config inválida;
- `.env.example` versionado; `.env` nunca commitado;
- Secrets de produção no gerenciador do provedor/GitHub Secrets.

## Git

- Branches de longa duração: `development` (integração) → `staging` (homologação) → `main` (produção);
- Trabalho do dia a dia em `feat/...`, `fix/...`, `chore/...`, sempre a partir de `development`;
- Promoção entre ambientes por PR: `development` → `staging` → `main`;
- Commits: Conventional Commits (`feat: adiciona saída de estoque`);
- PR obrigatório nas três branches protegidas: CI verde (`lint`, `test`, `audit`, `build`) + review — enquanto a equipe for de 1 dev, o auto-review é documentado na descrição do PR e o gate de aprovação fica em 0 (ver [11-infra-ci-cd.md](11-infra-ci-cd.md));
- Squash merge; sem push direto e sem force-push nas branches protegidas.

## Migrações de banco

- Somente via Prisma Migrate, versionadas no repositório;
- Migração destrutiva exige plano de rollback descrito no PR;
- Nunca editar migração já aplicada em produção.

## Qualidade

- ESLint + Prettier obrigatórios (CI bloqueia);
- TypeScript `strict: true`;
- Cobertura mínima: services de negócio com testes unitários (ver [12-estrategia-de-testes.md](12-estrategia-de-testes.md)).