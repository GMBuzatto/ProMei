# ProMei FE

Painel web (SaaS multi-tenant de gestão comercial para MEIs — estoque, itens, saídas com
comprovante, evoluindo para NFS-e, pagamentos e funcionários). Este repositório é só o
**front-end**; a API vive em `ProMei-BE` (repositório separado — [ADR-0004](docs/adr/0004-multi-repo.md)).

Documentação completa em [`docs/`](docs/README.md). Este arquivo é um resumo operacional —
em caso de dúvida ou conflito, os docs em `docs/` são a fonte de verdade.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS + shadcn/ui · TanStack Query · Zod ·
next-themes · Vitest · pnpm. Detalhes e justificativas: [docs/07-stack.md](docs/07-stack.md).

## Estrutura

```
src/
├── app/
│   ├── (auth)/login/        # rota pública
│   └── (dashboard)/         # rotas autenticadas (sidebar)
│       ├── dashboard/ items/ inventory/ companies/ users/ settings/
├── components/
│   ├── ui/                  # shadcn/ui
│   └── layout/               # sidebar, header, theme toggle
├── features/                # lógica por domínio (hooks, api calls, schemas zod)
├── lib/
│   ├── api/                 # client HTTP, ApiError, códigos de negócio, sessão
│   ├── env.ts               # config validada por Zod
│   ├── query-client.ts      # defaults do TanStack Query
│   └── utils.ts
├── hooks/                    # hooks genéricos
├── styles/                   # globals.css, tokens do tema
└── types/                    # tipos compartilhados com a API
```

Padrão: componentes de página finos em `app/`; lógica e chamadas à API em
`features/<domínio>`. Detalhes: [docs/08-padroes-de-desenvolvimento.md](docs/08-padroes-de-desenvolvimento.md).

## Design System, paleta e tema por nicho

Fonte de verdade visual — **nunca** usar hex ou classe Tailwind crua (`bg-blue-600`) direto
num componente; sempre o token semântico:

- [docs/styles/temas/default.md](docs/styles/temas/default.md) — Primitives e Semantic Tokens do tema padrão (Figma Variables);
- [docs/styles/DESIGN-SYSTEM.md](docs/styles/DESIGN-SYSTEM.md) — tokens, tipografia, espaçamento, componentes mínimos, dark mode;
- [docs/styles/temas/README.md](docs/styles/temas/README.md) — **tema por nicho**: a paleta de marca troca por segmento da empresa (alimentício, saúde...) via atributo `data-niche` no `<html>`, em runtime, sem rebuild — orquestrado por `NicheProvider`/`useNiche()` (`src/components/niche-provider.tsx`, registro de chaves em `src/lib/niches.ts`);
- Marca do tema `default`: `blue/600` (`#2563EB`); neutros em `slate`; semânticas `success`/`warning`/`danger`/`info` — **fixas em todo nicho**;
- Tokens expostos como CSS Variables (`--primary`, `--surface`, `--border`...) em `src/styles/globals.css` e consumidos via Tailwind (`bg-primary`, `text-foreground`).

## Configuração

- `.env.example` → `.env.local`; validado via Zod em `src/lib/env.ts` (ver [docs/07-configuracao-ambiente.md](docs/07-configuracao-ambiente.md));
- Regra geral de "nada hardcoded" (env var para config, token para visual): [docs/16-configuracao-sem-hardcode.md](docs/16-configuracao-sem-hardcode.md).

## Convenções essenciais

- Dados de servidor via TanStack Query; formulários com zod (mesmos schemas da API quando possível);
- Toda chamada à API passa por `@/lib/api` — nunca `fetch` direto em componente/hook. O client
  cuida de correlation id, `Authorization` e **refresh automático em 401**; erro sempre vira
  `ApiError` com `code` de negócio, exibido por `<ApiErrorAlert />`
  ([docs/17-camada-de-dados.md](docs/17-camada-de-dados.md));
- Dark/light com `next-themes` + classes `dark:`; nicho (paleta por segmento da empresa) com `NicheProvider` + atributo `data-niche` — as duas dimensões são independentes;
- Código e identificadores em **inglês**; UI e docs em **pt-BR**;
- **Nunca confiar em validação/permissão do front** — a API é a autoridade; o front só melhora a UX.

## Git

- Branches de longa duração: `development` → `staging` → `main` (protegidas: PR + CI verde obrigatórios, sem push direto);
- Dia a dia: `feat/...`, `fix/...`, `chore/...` a partir de `development`;
- Conventional Commits; squash merge.

## Rodando localmente

```bash
pnpm install
cp .env.example .env.local
pnpm dev   # http://localhost:3000 (API deve estar rodando em :3001)
```

Verificação local (mesmos gates do CI): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Índice de docs

Ver [docs/README.md](docs/README.md) para o índice completo (visão de produto, requisitos,
arquitetura, segurança, testes, CI/CD, ADRs, mockups).
