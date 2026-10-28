# ADR-0001: NestJS como framework do back-end

- Status: aceita
- Data: 2026-08-01

## Contexto

Back-end será Node.js (decisão prévia). Precisamos de auth, permissionamento granular multi-tenant e estrutura que suporte crescimento de equipe. Opções: NestJS, Fastify puro, Express.

## Decisão

**NestJS** (com adapter Fastify para performance).

## Justificativa

- Guards/interceptors nativos casam com o requisito central de permissionamento e escopo de tenant em toda rota;
- Estrutura opinada por módulos reduz decisões ad-hoc com equipe pequena;
- DI facilita testes;
- Ecossistema maduro (passport, class-validator, Prisma).

## Consequências

- Curva de aprendizado maior que Express; mais boilerplate;
- Mitigação: seguir os módulos definidos em [06-arquitetura.md](../06-arquitetura.md).
