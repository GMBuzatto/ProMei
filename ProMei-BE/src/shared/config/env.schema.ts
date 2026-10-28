import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { envValidationMap } from './env.config';

/**
 * Gera schema Zod dinamicamente lendo .env.example.
 * Variáveis conhecidas (em env.config.ts) usam validações específicas.
 * Variáveis desconhecidas são validadas como strings obrigatórias.
 */
function buildDynamicEnvSchema(): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const examplePath = path.resolve(process.cwd(), '.env.example');

  if (!fs.existsSync(examplePath)) {
    throw new Error(
      `Arquivo .env.example não encontrado em ${examplePath}. ` +
        'Este arquivo é necessário para gerar o schema de validação.',
    );
  }

  const exampleContent = fs.readFileSync(examplePath, 'utf-8');
  const schemaShape: Record<string, z.ZodTypeAny> = {};

  // Lê cada linha do .env.example
  exampleContent.split('\n').forEach((line) => {
    const trimmed = line.trim();

    // Ignora comentários e linhas vazias
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    // Extrai nome da variável
    const [key] = trimmed.split('=');
    if (!key) return;

    const keyName = key.trim();

    // Se variável tem validação conhecida, usa; senão, string obrigatória
    schemaShape[keyName] = envValidationMap[keyName] ?? z.string();
  });

  return z.object(schemaShape);
}

/**
 * Schema Zod dinâmico gerado a partir de .env.example.
 * Lê o arquivo na inicialização e constrói o schema com base nas variáveis presentes.
 */
export const envSchema = buildDynamicEnvSchema();

export type Env = z.infer<typeof envSchema>;

/**
 * Valida as variáveis de ambiente no boot. A aplicação não sobe com config inválida.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ❌ ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      '\n❌ ZOD VALIDATION FAILED\n' +
        '═'.repeat(50) +
        '\n\n' +
        'Variáveis com erro de tipo ou validação:\n' +
        `${issues}\n` +
        '═'.repeat(50),
    );
  }

  assertFaultInjectionIsSafe(result.data);
  assertTransactionTimeoutsAreOrdered(result.data);
  assertCreditLimitsAreCoherent(result.data);

  return result.data;
}

/**
 * A injecao de falha existe para ensaiar os alertas em staging (docs/13). Ligada
 * em producao ela vira um endpoint que qualquer um usa para gerar 5xx de verdade,
 * entao o boot falha em dois casos: ligada em producao, ou ligada sem segredo.
 */
function assertFaultInjectionIsSafe(env: Env): void {
  if (env['FAULT_INJECTION_ENABLED'] !== true) return;

  const environment = String(env['SENTRY_ENVIRONMENT'] ?? env['NODE_ENV'] ?? '');
  const errors: string[] = [];

  if (env['NODE_ENV'] === 'production' || environment === 'production') {
    errors.push(
      'FAULT_INJECTION_ENABLED=true e proibido em producao. Use staging para ensaiar alertas.',
    );
  }

  const token: unknown = env['FAULT_INJECTION_TOKEN'];
  if (typeof token !== 'string' || token.length < 16) {
    errors.push(
      'FAULT_INJECTION_ENABLED=true exige FAULT_INJECTION_TOKEN com no minimo 16 caracteres.',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      '\n❌ CONFIG DE INJECAO DE FALHA INVALIDA\n' +
        '═'.repeat(50) +
        '\n\n' +
        errors.map((error) => `  ❌ ${error}`).join('\n') +
        '\n' +
        '═'.repeat(50),
    );
  }
}

/**
 * O teto da transação precisa ser MAIOR que o do lock, nos dois módulos que
 * seguram lock de linha (estoque e venda).
 *
 * Invertidos, a transação do Prisma morre antes de o Postgres devolver 55P03 —
 * e aí a contenção chega como timeout genérico, sem dizer que foi fila. Isso
 * está documentado desde a implementação da movimentação de estoque, mas nada
 * garantia a ordem: eram dois números independentes no .env.
 */
function assertTransactionTimeoutsAreOrdered(env: Env): void {
  const pairs: [string, string][] = [
    ['INVENTORY_LOCK_TIMEOUT_MS', 'INVENTORY_TRANSACTION_TIMEOUT_MS'],
    ['SALES_LOCK_TIMEOUT_MS', 'SALES_TRANSACTION_TIMEOUT_MS'],
    ['PAYMENTS_LOCK_TIMEOUT_MS', 'PAYMENTS_TRANSACTION_TIMEOUT_MS'],
  ];

  const errors = pairs
    .filter(([lockKey, txKey]) => Number(env[txKey]) <= Number(env[lockKey]))
    .map(
      ([lockKey, txKey]) =>
        `${txKey} (${String(env[txKey])}) precisa ser MAIOR que ${lockKey} (${String(env[lockKey])}): ` +
        'senao a transacao aborta antes de o Postgres reportar a contencao de lock.',
    );

  if (errors.length > 0) {
    throw new Error(
      '\n❌ CONFIG DE TIMEOUT INVALIDA\n' +
        '═'.repeat(50) +
        '\n\n' +
        errors.map((error) => `  ❌ ${error}`).join('\n') +
        '\n' +
        '═'.repeat(50),
    );
  }
}

/**
 * O limite padrao de cliente novo nao pode nascer acima do teto aceito na
 * alteracao: toda empresa comecaria com um valor que o proprio endpoint de
 * alteracao recusaria.
 */
function assertCreditLimitsAreCoherent(env: Env): void {
  const defaultLimit = Number(env['FINANCE_DEFAULT_CREDIT_LIMIT']);
  const maxLimit = Number(env['FINANCE_MAX_CREDIT_LIMIT']);

  if (defaultLimit > maxLimit) {
    throw new Error(
      '\n❌ CONFIG DE CREDITO INVALIDA\n' +
        '═'.repeat(50) +
        '\n\n' +
        `  ❌ FINANCE_DEFAULT_CREDIT_LIMIT (${String(defaultLimit)}) e maior que ` +
        `FINANCE_MAX_CREDIT_LIMIT (${String(maxLimit)}).\n` +
        '═'.repeat(50),
    );
  }
}
