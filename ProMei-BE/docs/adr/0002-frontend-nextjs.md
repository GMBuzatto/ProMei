# ADR-0002: Next.js como framework do front-end

- Status: aceita
- Data: 2026-08-01

## Contexto

A ideia inicial listava "Next + Vite". São alternativas concorrentes: Next.js tem bundler próprio (Turbopack); Vite serviria para uma SPA React pura.

## Decisão

**Next.js 15 (App Router) + TypeScript + Tailwind.** Vite descartado.

## Justificativa

- Um framework só cobre roteamento, build, otimizações e futura landing page/SEO;
- Ecossistema Tailwind + shadcn/ui + next-themes entrega dark/light e responsividade rápido;
- Painéis autenticados usam client components normalmente; SSR fica disponível para páginas públicas futuras.

## Consequências

- Deploy exige runtime Node (não é estático puro) — ok, já teremos infra para a API;
- Se o painel se provar 100% SPA, o custo do Next ainda é aceitável.
