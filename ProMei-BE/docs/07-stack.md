# Stack Tecnológica — ProMei

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
| Filas | Nenhuma; BullMQ + Redis quando entrar mensageria | Idem |
| Agendamento | **`@nestjs/schedule`** (fase 2) | Cron in-process para materializar vendas em atraso (docs/21). **Não é fila**: o job é conveniência, não correção — nenhuma decisão de crédito depende dele ter rodado (RN-67). Múltiplas réplicas são resolvidas com `pg_advisory_lock`, sem Redis |
| Datas | **`date-fns` + `date-fns-tz`** (fase 2) | Só no módulo `finance`. Fechamento com dia 29/30/31, fevereiro, bissexto e fuso é onde os bugs moram; `endOfMonth`/`addMonths`/conversão de fuso testadas por milhões de usuários valem mais que 200 linhas próprias de calendário ([PD-10](31-decisoes-pendentes.md#pd-10)) |
| Arquivos | Disco local no MVP → S3-compatível (Cloudflare R2/Backblaze) | Custo mínimo |
| PDF | **PDFKit** (avaliado na implementação do RF-33) | Comprovantes; Puppeteer exigiria um Chromium por container e pdfmake embarca ~2 MB de fontes — o comprovante é uma página com fontes padrão do PDF |
| Auth | JWT próprio (passport-jwt) | Controle total do permissionamento |
| Cloud | VPS (Hetzner/DigitalOcean) ou Railway/Render no início | Custo |
| CI/CD | GitHub Actions | Padrão de mercado, grátis p/ repositório |
| Logs/erros | Pino (logs JSON) + Sentry (free tier) | Observabilidade barata |
| Métricas | Prometheus + Grafana (ou métricas do provedor) | Fase 2; health checks desde o dia 1 |
| Testes | Vitest/Jest + Supertest + Playwright | Unit, integração e E2E |

## Paleta de cores e tema

- Definir paleta da marca (tokens no Tailwind: `primary`, `secondary`, `surface`, `danger`, etc.);
- Dark/light via `next-themes` + classes `dark:` do Tailwind;
- Tokens centralizados em `tailwind.config` — nunca cores hardcoded em componentes.

## O que evitamos deliberadamente

- Microserviços (monolito modular até doer);
- Kubernetes (Docker + provedor simples bastam);
- GraphQL (REST resolve o escopo atual);
- Redis/filas antes de existir necessidade medida (agendador in-process **não** é fila).
