# Stack Tecnológica — ProMei FE

Critérios: equipe pequena, custo baixo, ecossistema Node/TypeScript de ponta a ponta, longevidade.

| Camada | Escolha | Justificativa |
|---|---|---|
| Front-end | **Next.js 15 + TypeScript** | App Router, ecossistema maduro; substitui a necessidade de Vite ([ADR-0002](adr/0002-frontend-nextjs.md)) |
| Estilo | **Tailwind CSS + shadcn/ui** | Velocidade de UI, dark/light nativo, responsivo |
| Estado/dados | TanStack Query | Cache e sincronização com a API |
| Back-end | **NestJS (Node 22 LTS) + TypeScript** | Estrutura opinada, DI, guards — ideal para permissionamento multi-tenant ([ADR-0001](adr/0001-backend-nestjs.md)) |
| ORM | **Prisma 7** | Migrações versionadas, type-safety, client extension p/ tenant; cliente sem Rust (instalação e deploy mais leves) |
| Banco | **PostgreSQL 16** | Confiável, RLS, JSONB para limites de plano |
| Cache | Nenhum no MVP (adicionar Redis quando houver necessidade medida) | Evitar complexidade prematura |
| Filas | Nenhuma no MVP; BullMQ + Redis quando entrar mensageria | Idem |
| Arquivos | Disco local no MVP → S3-compatível (Cloudflare R2/Backblaze) | Custo mínimo |
| PDF | **PDFKit** (avaliado na implementação do RF-33) | Comprovantes; Puppeteer exigiria um Chromium por container e pdfmake embarca ~2 MB de fontes — o comprovante é uma página com fontes padrão do PDF |
| Auth | JWT próprio (passport-jwt) | Controle total do permissionamento |
| Cloud | VPS (Hetzner/DigitalOcean) ou Railway/Render no início | Custo |
| CI/CD | GitHub Actions | Padrão de mercado, grátis p/ repositório |
| Logs/erros | Pino (logs JSON) + Sentry (free tier) | Observabilidade barata |
| Métricas | Prometheus + Grafana (ou métricas do provedor) | Fase 2; health checks desde o dia 1 |
| Testes | Vitest/Jest + Supertest + Playwright | Unit, integração e E2E |

## Paleta de cores e tema

- Paleta e tokens definidos em [`docs/styles/temas/default.md`](styles/temas/default.md) (Figma Variables) e [`docs/styles/DESIGN-SYSTEM.md`](styles/DESIGN-SYSTEM.md) (guia de implementação): marca `blue/600` (`#2563EB`), neutros `slate`, semânticas `green`/`amber`/`red`/`sky`;
- Três níveis de token — Primitives → Semantic (`Light`/`Dark`) → Components — implementados como CSS Variables em `src/styles/globals.css` (Tailwind 4, sem `tailwind.config`) e consumidos via classes utilitárias (`bg-primary`, `text-foreground`, `border-border`...);
- Dark/light via `next-themes` + classes `dark:` do Tailwind;
- **Tema por nicho** (segmento da empresa: alimentício, saúde...): a camada de marca troca em runtime via atributo `data-niche` no `<html>`, sem rebuild — mecanismo completo em [`docs/styles/temas/README.md`](styles/temas/README.md);
- Tokens centralizados em `src/styles/globals.css` — nunca cores hardcoded em componentes (ver regra de implementação em [DESIGN-SYSTEM.md §22](styles/DESIGN-SYSTEM.md) e [16-configuracao-sem-hardcode.md](16-configuracao-sem-hardcode.md)).

## O que evitamos deliberadamente

- Microserviços (monolito modular até doer);
- Kubernetes (Docker + provedor simples bastam);
- GraphQL (REST resolve o escopo atual);
- Redis/filas antes de existir necessidade medida.
