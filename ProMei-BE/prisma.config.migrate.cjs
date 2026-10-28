/**
 * Configuração do Prisma CLI usada SÓ dentro do container, para
 * `prisma migrate deploy` no boot (docker-entrypoint.sh).
 *
 * Existe separada de `prisma.config.ts` por dois motivos:
 *
 * 1. A imagem runtime não tem TypeScript nem tsx (devDependencies removidas no
 *    `pnpm prune`), então um config `.ts` não carregaria. CommonJS carrega.
 * 2. O CLI roda a partir de /app/.migrate, que tem seu próprio node_modules
 *    enxuto (só o pacote `prisma`); por isso os caminhos do schema e das
 *    migrações são absolutos, e não relativos ao cwd.
 *
 * Sem `import 'dotenv/config'`: no container a DATABASE_URL já vem como
 * variável de ambiente do processo, entregue pelo Railway.
 */
const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: '/app/prisma/schema.prisma',
  migrations: {
    path: '/app/prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
