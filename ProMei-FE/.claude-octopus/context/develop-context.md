# Context: Mahoraga FE — Regras do Projeto

## User Vision

Regras fixas que todo agente (Claude nativo e providers do Octopus — Gemini/Codex) deve
respeitar em qualquer fase (discover/define/develop/deliver) deste repositório.

## Technical Approach

**Gerenciador de pacotes:** somente `pnpm`. Nunca usar `npm`/`npx` — usar `pnpm exec` no
lugar de `npx` (ex.: `pnpm exec prisma migrate status`).

**`docs/` é a base de arquitetura do projeto** — consultar antes de propor/implementar
qualquer coisa. Índice completo em `docs/README.md`. Mais consultados no dia a dia:

- `docs/06-arquitetura.md` — C4, ERD, multi-tenancy, fluxos críticos (backbone da arquitetura).
- `docs/08-padroes-de-desenvolvimento.md` — estrutura de módulos, nomenclatura, API,
  tratamento de erros, git/commits, qualidade (ESLint/Prettier/TS strict).
- `docs/03-requisitos.md` — requisitos funcionais (RF-_) e não funcionais (RNF-_).
- `docs/09-seguranca.md` — autenticação/autorização, isolamento multi-tenant, proteções
  OWASP, auditoria, LGPD, threat model.

Demais docs relevantes conforme a fase: `01-visao-do-produto.md`, `02-escopo-e-mvp.md`,
`04-regras-de-negocio.md`, `07-stack.md`, `10-ambientes.md`, `11-infra-ci-cd.md`,
`12-estrategia-de-testes.md`, `13-observabilidade.md`, `adr/` (decisões formais). A versão
compilada e estilizada de toda a documentação (mockup de apresentação) está em
`docs/Mahoraga - Documentação.dc.html` — útil para visão geral rápida, mas os `.md`
individuais são a fonte de verdade (é neles que qualquer atualização deve ser feita).

**Banco de dados:** `prisma/schema.prisma` é a fonte de verdade do banco. Toda alteração de
schema é feita ali e materializada via `pnpm db:migrate` (Prisma Migrate) — nunca alterar o
banco manualmente nem editar uma migration já aplicada em produção. Scripts relevantes do
`package.json`:

- `pnpm db:generate` → `prisma generate` (regenera o client a partir do schema)
- `pnpm db:migrate` → `prisma migrate dev` (cria e aplica migration local)
- `pnpm db:migrate:deploy` → `prisma migrate deploy` (aplica migrations em CI/produção)
- `pnpm db:seed` → `prisma db seed` (roda `prisma/seed.ts` via tsx)

**Outros scripts úteis:** `pnpm start` / `pnpm start:dev` (nest start), `pnpm typecheck`
(`tsc --noEmit`), `pnpm lint` / `pnpm lint:fix`, `pnpm test` (vitest run), `pnpm format`.

**Configuração sem hardcode:** todo valor pré-configurável (timeout, TTL, rate limit,
threshold, limite de paginação) vem de variável de ambiente validada em
`src/shared/config/env.config.ts` (Zod), nunca de uma constante fixa no código. TTLs em
segundos/ms numéricos, nunca string tipo `"15m"`. Ver
`docs/16-configuracao-sem-hardcode.md`.

## Scope

**In Scope:**
Aplicar estas regras em toda pesquisa/implementação feita neste repositório, em qualquer
fase do workflow Double Diamond (discover/define/develop/deliver).

**Out of Scope:**
N/A — regras de base do projeto, não uma feature específica.

## Decisions Made

[Key decisions will be added here]

---

_Created: 2026-08-06T00:00:00Z_
