# Configuração sem Hardcode — ProMei FE

> Adaptado da versão original deste doc, escrita para o back-end (NestJS). O princípio é o
> mesmo, mas no front-end ele se aplica a **dois tipos de valor**: configuração de ambiente
> (rara aqui — ver [07-configuracao-ambiente.md](07-configuracao-ambiente.md)) e **tokens
> visuais** do Design System (frequente em todo componente).

## Regra

1. Todo valor **pré-configurável/ajustável** por ambiente (URL da API, feature flag, timeout
   de requisição) vem de variável de ambiente validada via Zod (`src/lib/env.ts`) — nunca de
   uma constante hardcoded no código;
2. Todo valor **visual** (cor, espaçamento, raio de borda, tipografia) vem de um **token do
   Design System** (CSS Variable / classe Tailwind semântica) — nunca hex, `px` avulso ou
   nome de cor Tailwind cru no componente. Fonte de verdade:
   [DESIGN-SYSTEM.md](styles/DESIGN-SYSTEM.md) e [temas/](styles/temas/README.md) (tokens de
   marca variam por nicho da empresa — ver [temas/README.md](styles/temas/README.md)).

**Por quê:** um valor hardcoded só muda com deploy de código (ou, no caso de cor, com um
grep manual por todos os componentes que a repetiram). Como env var ou token, ele muda em um
único lugar (`.env.example` / `tailwind.config`) e não corre o risco de um componente ficar
com `#2563EB` enquanto outro usa `#1D4ED8` para a mesma cor "primária" depois de um reajuste
de paleta.

## O que conta como "pré-configurável" (ambiente)

| Cai na regra (→ env var) | Não cai na regra (hardcode ok) |
|---|---|
| URL base da API | Rotas do App Router (`app/(dashboard)/items/`) |
| Feature flags | Enums de domínio espelhados da API (`CompanyStatus`) |
| Timeout de requisição HTTP | Mensagens de erro de validação de formulário |
| `staleTime`/`retry` do TanStack Query, se parametrizado | Estrutura de payload/DTO |

Se a dúvida for "um dev vai querer mudar esse valor sem mexer em código, em outro
ambiente?" — se sim, é env var.

## O que conta como "hardcode proibido" (visual)

| Cai na regra (→ token) | Não cai na regra |
|---|---|
| Cor de texto, fundo, borda | — |
| Espaçamento (`padding`, `gap`, `margin`) | Espaçamento pontual sem equivalente na escala de 4px (raro; documentar por quê) |
| Border radius | — |
| Peso/tamanho de fonte fora da escala tipográfica | — |

```text
❌ bg-blue-600 espalhado pela aplicação
❌ style={{ color: '#2563EB' }}
❌ cor inventada em uma tela específica

✅ bg-primary
✅ text-foreground
✅ border-default
```

Ver regra completa em [DESIGN-SYSTEM.md §21-22](styles/DESIGN-SYSTEM.md).

## Como adicionar uma env var

Mesmo fluxo de
[07-configuracao-ambiente.md](07-configuracao-ambiente.md#adicionando-nova-variável):

1. `.env.example` — adiciona a chave com o valor padrão;
2. `src/lib/env.ts` — adiciona o validador Zod;
3. `.env.local` — preenche o valor local;
4. No código, importa `env` de `@/lib/env` — nunca `process.env.X` disperso.

## Como adicionar um token visual

1. Confirmar que o token já não existe em [temas/default.md](styles/temas/default.md)
   (Primitives ou Semantic) antes de propor um novo valor;
2. Decidir se o token é **fixo** (neutro/semântico, igual em todo nicho) ou de **marca**
   (varia por nicho — segue a fórmula de [temas/README.md](styles/temas/README.md#tokens-derivados-fórmula));
3. Adicionar/editar a CSS Variable em `src/styles/globals.css` — fixo vai em `:root`/`.dark`;
   de marca vai também nos blocos `[data-niche="..."]` de cada nicho;
4. Expor no bloco `@theme inline` do mesmo arquivo como utilitário Tailwind;
5. Consumir no componente pela classe Tailwind semântica, nunca pelo valor bruto.

## Inventário atual

### Env vars

`.env.example` é o catálogo único e sempre atualizado. Hoje:

| Env var | Onde é lida |
|---|---|
| `NEXT_PUBLIC_API_URL` | `src/lib/env.ts` → `src/lib/api/client.ts` |
| `NEXT_PUBLIC_API_TIMEOUT_MS` | `src/lib/env.ts` → `src/lib/api/client.ts` |
| `NEXT_PUBLIC_QUERY_STALE_TIME_MS` | `src/lib/env.ts` → `src/lib/query-client.ts` |
| `NEXT_PUBLIC_QUERY_RETRY` | `src/lib/env.ts` → `src/lib/query-client.ts` |

### Tokens visuais

Fonte única: [temas/default.md](styles/temas/default.md) (Primitives + Semantic do nicho
padrão), [temas/README.md](styles/temas/README.md) (tokens de marca por nicho) e
[DESIGN-SYSTEM.md](styles/DESIGN-SYSTEM.md) (convenção de CSS Variables/Tailwind). Não
duplicar a lista de tokens aqui — consultar sempre os docs de estilo.
