<div align="center">

<img src="public/icon.png" alt="ProMei" width="96" />

# ProMei — Front-end

**Painel web do ProMei, SaaS de gestão comercial para MEIs.** Responsivo, dark/light.

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?logo=shadcnui&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-5-FF4154?logo=reactquery&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)

[**Documentação**](docs/README.md) · [**Stack**](docs/07-stack.md) · [**Padrões**](docs/08-padroes-de-desenvolvimento.md) · [**Camada de dados**](docs/17-camada-de-dados.md) · [**Design System**](docs/styles/DESIGN-SYSTEM.md) · [**API (ProMei-BE)**](../ProMei-BE/README.md)

</div>

---

## 🧰 Stack

| Camada       | Tecnologia                    |
| ------------ | ----------------------------- |
| Framework    | Next.js 15 (App Router)       |
| Linguagem    | TypeScript                    |
| Estilo       | Tailwind CSS · shadcn/ui      |
| Dados        | TanStack Query                |
| Tema         | next-themes                   |

## 📁 Estrutura

```
src/
├── app/                    # rotas do App Router — páginas finas (metadata + composição)
│   ├── (auth)/             # rotas públicas
│   │   ├── login/
│   │   └── change-password/   # troca de senha obrigatória
│   └── (dashboard)/        # rotas autenticadas (AuthGuard + layout com sidebar)
│       ├── dashboard/
│       ├── items/          # CRUD de itens
│       ├── inventory/      # movimentações de estoque + comprovantes
│       ├── users/          # usuários da empresa
│       ├── roles/          # papéis e matriz de permissões
│       ├── companies/      # visão Super Admin: empresas (tenants) e assinaturas
│       ├── plans/          # visão Super Admin: planos
│       └── settings/       # conta, empresa, aparência e nicho
├── components/
│   ├── ui/                 # shadcn/ui (button, input, select, dialog...)
│   ├── layout/             # dashboard shell, sidebar, header, theme toggle
│   ├── brand/              # logo e wordmark
│   └── *.tsx               # ApiErrorAlert, ListEmptyState, TableSkeletonRows, StatCard,
│                           # providers (query, theme, niche)
├── features/               # um diretório por domínio: api.ts, hooks.ts, schemas.ts,
│   │                       # types.ts, lógica pura e components/
│   ├── auth/  dashboard/  items/  inventory/  receipts/
│   ├── users/  roles/  companies/  plans/  subscriptions/  settings/
├── lib/
│   ├── api/                # client HTTP, ApiError, códigos de negócio, sessão, correlation id
│   ├── env.ts              # config validada por Zod
│   ├── query-client.ts     # defaults do TanStack Query
│   └── ...                 # routes, navigation, pagination, niches, jwt, money, utils
├── hooks/                  # hooks genéricos (sem domínio)
├── styles/                 # globals.css — tokens do tema (CSS variables)
└── types/                  # contratos HTTP comuns (paginação, usuário autenticado)
test/                       # testes Vitest, espelhando a árvore de src/
```

> [!TIP]
> Componentes de página finos em `app/`; lógica e chamadas à API vivem em `features/<domínio>`.

## 🚀 Rodando localmente

```bash
pnpm install
cp .env.example .env.local
pnpm dev   # http://localhost:3000
```

> [!NOTE]
> A API ([ProMei-BE](../ProMei-BE/README.md)) deve estar rodando em `:3001`.

## 📐 Convenções essenciais

- 🎨 Cores só via tokens do Tailwind (`primary`, `surface`...) — nunca hex hardcoded;
- 🌗 Dark/light com `next-themes` + classes `dark:`;
- 🔗 Dados de servidor via TanStack Query; formulários com validação zod (mesmos schemas da API quando possível);
- 🔒 Nunca confiar em validação/permissão do front — a API é a autoridade.
