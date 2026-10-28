import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Convencao do README/docs-08: testes vivem em test/, nunca dentro de src/.
    // Declarar o include explicitamente faz a regra ser cobrada, e nao apenas combinada.
    include: ['test/unit/**/*.spec.ts', 'test/integration/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    // Os testes de integracao sobem um Postgres por arquivo (testcontainers) e
    // rodam em paralelo: sob contencao de I/O, uma requisicao que normalmente
    // leva ~200ms estoura o default de 5s do Vitest e falha de forma
    // intermitente, sem nada de errado no codigo. 30s e folga suficiente para o
    // ruido sem mascarar um teste realmente travado.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
  plugins: [swc.vite()],
});
