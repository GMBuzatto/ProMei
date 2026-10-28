import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuração do Prisma CLI (obrigatória a partir do Prisma 7).
 *
 * O `import 'dotenv/config'` é indispensável: a partir da v7 o Prisma NÃO carrega
 * o `.env` sozinho. Como o dotenv não sobrescreve variáveis já definidas, os
 * testes de integração continuam funcionando — eles setam `process.env.DATABASE_URL`
 * com a URI do container antes de invocar o CLI.
 */

/**
 * Por que não usar o helper `env('DATABASE_URL')` do Prisma:
 *
 * Ele lança `PrismaConfigEnvError` já no carregamento do arquivo quando a
 * variável não existe — e o config é carregado por QUALQUER comando, inclusive
 * `prisma generate`, que não precisa de banco nenhum. Isso quebrava o CI e
 * quebraria também um `docker build`, onde não há `.env`.
 *
 * Com o fallback abaixo, `generate` funciona em qualquer ambiente e apenas os
 * comandos que realmente falam com o banco (`migrate`, `db seed`) falham — aí
 * sim legitimamente — se a URL não estiver configurada.
 */
const SEM_BANCO_CONFIGURADO = 'postgresql://localhost:5432/promei?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? SEM_BANCO_CONFIGURADO,
  },
});
