import { z } from 'zod';

/**
 * Configuração de validação para variáveis de ambiente conhecidas.
 * Mapeia nome da variável para seu schema Zod.
 *
 * Variáveis não listadas aqui são validadas como strings obrigatórias.
 */
export const envValidationMap: Record<string, z.ZodTypeAny> = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default('/api/v1'),
  // Allowlist de origens (CSV). A comparacao do navegador e literal: esquema,
  // host e porta precisam bater exatamente e a barra final invalida o match
  // (`http://app.com/` nunca casa com o Origin `http://app.com`) — por isso ela
  // e removida aqui em vez de virar um erro de CORS em producao.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    )
    .refine((origins) => origins.length > 0, {
      message:
        'CORS_ORIGINS vazio: nenhuma origem seria aceita e todo request do front-end falharia com erro de CORS.',
    })
    .refine((origins) => !origins.includes('*'), {
      message:
        'CORS_ORIGINS nao aceita "*": a allowlist e explicita por ambiente (docs/09-seguranca.md).',
    }),

  DATABASE_URL: z.string().url(),
  // Default do driver pg (10) é apertado para requisições que seguram
  // conexão por uma transação inteira (venda, N itens): concorrência real
  // esbarra em timeout de conexão antes de qualquer lock do Postgres
  // entrar em jogo.
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),

  // TTLs em segundos (não string tipo "15m"/"7d") para servir tanto o jsonwebtoken
  // (expiresIn aceita number) quanto cálculo de datas (refresh_tokens.expires_at).
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  JWT_REFRESH_TTL_REMEMBER_ME: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 24 * 60 * 60),

  AUTH_MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),

  // Rate limit estrito em /auth/* (docs/09-seguranca.md), mais restritivo que o global.
  // Teto do bloqueio progressivo: por mais reincidencias que haja, nao passa disso.
  AUTH_LOCKOUT_MAX_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),

  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  AUTH_LOGIN_RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),

  // Rate limit global por IP (docs/09-seguranca.md).
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),

  // Timeout dos checks de /health/ready (docs/13-observabilidade.md).
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

  // Paginação padrão de listagens (docs/08-padroes-de-desenvolvimento.md).
  PAGINATION_DEFAULT_LIMIT: z.coerce.number().int().positive().default(20),
  PAGINATION_MAX_LIMIT: z.coerce.number().int().positive().default(100),

  // Geração automática de SKU quando o item é criado sem código (RN-25).
  // O sufixo é numérico e sequencial por empresa; o padding define quantos
  // dígitos ele ocupa (ITM-000001 com padding 6).
  ITEM_SKU_PREFIX: z.string().min(1).default('ITM'),
  ITEM_SKU_SEQUENCE_PADDING: z.coerce.number().int().positive().default(6),
  // RN-20 é garantida pelo índice único (company_id, sku): duas criações
  // simultâneas podem gerar o mesmo número, e a perdedora tenta de novo.
  ITEM_SKU_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Movimentação de estoque (RF-32, RN-21).
  //
  // `lock_timeout` limita quanto tempo o SELECT ... FOR UPDATE espera pela
  // linha do item travada por outra movimentação. Sem teto, uma transação
  // pendurada bloquearia a fila inteira de saídas daquele item.
  INVENTORY_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  // Teto da transação inteira. Precisa ser MAIOR que o lock timeout, senão o
  // Prisma aborta antes de o Postgres devolver o erro de lock — e o motivo real
  // some do log.
  INVENTORY_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Sanidade da quantidade informada: dedo escorregado no teclado não deveria
  // conseguir mover um milhão de unidades. Vale para os três tipos, em módulo.
  INVENTORY_MAX_MOVEMENT_QUANTITY: z.coerce.number().int().positive().default(1_000_000),

  // Comprovante de saída (RF-33, RN-24).
  //
  // Disco local no MVP, conforme docs/07-stack.md — a variável existe para que
  // trocar por um volume montado (ou por um bucket S3, na fase 2) seja mudança
  // de ambiente, não de código.
  RECEIPT_STORAGE_DIR: z.string().min(1).default('./storage/receipts'),
  // Dígitos do número sequencial impresso no comprovante (000123 com padding 6).
  RECEIPT_NUMBER_PADDING: z.coerce.number().int().positive().default(6),
  // Geração do PDF é assíncrona e com retry (docs/06): falhar não pode derrubar
  // a movimentação, que já está comitada quando a geração começa.
  RECEIPT_PDF_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // Base do backoff exponencial entre tentativas (1s, 2s, 4s...).
  RECEIPT_PDF_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1_000),

  // ───────────────────────────────────────────────────────────────────────────
  // Fase 2 — Cliente + Compras (docs/17 a 32)
  // ───────────────────────────────────────────────────────────────────────────

  // Padrões de empresa nova; cada empresa guarda os seus em
  // company_finance_settings. Trocar aqui não reescreve empresa existente.
  //
  // 1..31: o dia maior que o mês satura no último dia (docs/20, RN-53). A
  // validação de faixa mora aqui porque um closing_day 0 ou 32 não gera erro
  // visível — gera período errado em silêncio.
  FINANCE_DEFAULT_CLOSING_DAY: z.coerce.number().int().min(1).max(31).default(1),

  // Fuso IANA usado no CORTE do período. Validado de verdade, não só como
  // string: um fuso inválido só apareceria meses depois, como venda no período
  // errado. `Intl` lança RangeError para identificador desconhecido.
  FINANCE_DEFAULT_TIMEZONE: z
    .string()
    .min(1)
    .default('America/Sao_Paulo')
    .refine(
      (value) => {
        try {
          new Intl.DateTimeFormat('pt-BR', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      },
      {
        message:
          'FINANCE_DEFAULT_TIMEZONE precisa ser um fuso IANA válido (ex.: America/Sao_Paulo).',
      },
    ),

  // Zero de propósito: cliente novo não compra fiado até alguém decidir que pode.
  FINANCE_DEFAULT_CREDIT_LIMIT: z.coerce.number().nonnegative().default(0),
  // Teto do PATCH /customers/:id/credit-limit. Barra dedo escorregado virando
  // limite de sete dígitos.
  FINANCE_MAX_CREDIT_LIMIT: z.coerce.number().positive().default(1_000_000),
  FINANCE_DEFAULT_DUE_DAYS: z.coerce.number().int().positive().default(30),
  // Regra de negócio configurável, como as 5 tentativas de login do RF-03: o
  // requisito fixa o padrão, o env permite ajustar sem deploy (docs/16).
  FINANCE_DELINQUENCY_DAYS: z.coerce.number().int().positive().default(30),

  // Job diário que materializa vendas EM_ATRASO (docs/21).
  //
  // Cron de 5 ou 6 campos. A validação é de forma, não de semântica: expressão
  // malformada faria o job simplesmente nunca disparar, e "nunca disparou" é
  // indistinguível de "não tinha nada para fazer".
  FINANCE_OVERDUE_JOB_CRON: z
    .string()
    .min(1)
    .default('0 3 * * *')
    .refine((value) => [5, 6].includes(value.trim().split(/\s+/).length), {
      message: 'FINANCE_OVERDUE_JOB_CRON precisa ter 5 ou 6 campos (ex.: "0 3 * * *").',
    }),
  // Mesmo padrão de FAULT_INJECTION_ENABLED: z.coerce.boolean() não serve,
  // porque Boolean('false') é true — a flag ficaria ligada com o valor que
  // deveria desligá-la.
  FINANCE_OVERDUE_JOB_ENABLED: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  ),

  // Venda (docs/19). Mesma mecânica de INVENTORY_*, e pelo mesmo motivo: o teto
  // da transação precisa ser MAIOR que o do lock, senão o Prisma aborta antes de
  // o Postgres devolver 55P03 e o motivo real da falha some. A ordem é checada
  // no boot (env.schema.ts).
  SALES_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  SALES_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  // Venda longa segura os locks das linhas dos itens por mais tempo e atrasa
  // vendas concorrentes dos mesmos produtos.
  SALES_MAX_ITEMS_PER_SALE: z.coerce.number().int().positive().default(100),
  // Separado de RECEIPT_NUMBER_PADDING: sequência e namespace de lock
  // próprios (docs/19).
  SALES_NUMBER_PADDING: z.coerce.number().int().positive().default(6),

  // Recebimento (docs/22). Mesma mecânica de SALES_*/INVENTORY_*: teto da
  // transação MAIOR que o do lock, checado no boot (env.schema.ts).
  PAYMENTS_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  PAYMENTS_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  // Senha administrativa de liberação de venda (docs/24).
  // Rate limit por usuário, lockout por empresa: a senha é compartilhada, então
  // um operador errando não pode travar o balcão inteiro de primeira.
  SALE_AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  SALE_AUTH_RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  SALE_AUTH_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  SALE_AUTH_LOCKOUT_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),

  // Limite de clientes usado quando o plano não define `maxCustomers` (RN-14).
  PLAN_DEFAULT_MAX_CUSTOMERS: z.coerce.number().int().positive().default(100),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SENTRY_DSN: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),

  // NODE_ENV nao pode valer "staging": Node e boa parte das libs tratam qualquer
  // valor diferente de "production" como desenvolvimento. O ambiente reportado ao
  // Sentry e independente por isso — e e ele que separa os alertas de staging dos
  // de producao (docs/13-observabilidade.md). Vazio = cai no NODE_ENV — dai o
  // preprocess: a variavel existe vazia no .env.example, e "" nao passaria no min(1).
  SENTRY_ENVIRONMENT: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),

  // Amostragem de transacoes (0..1). Em 0 nao ha tracing, sem tracing nao ha p95,
  // e sem p95 o alerta de latencia do docs/13 nao tem sinal para observar.
  // Sugestao: 1 em staging (volume baixo, ensaio de alerta), 0.1 em producao.
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

  // Espera maxima pelo envio dos eventos pendentes no shutdown. Sem isso, um
  // container derrubado logo apos o erro leva o evento embora sem entregar.
  SENTRY_FLUSH_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),

  // Injecao de falha para ENSAIAR os alertas em staging (docs/13, docs/15).
  // `z.coerce.boolean()` nao serve aqui: Boolean('false') e true, entao a flag
  // ficaria ligada com o valor que deveria desliga-la.
  FAULT_INJECTION_ENABLED: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  ),
  // Segredo exigido no header das rotas de injecao de falha. Obrigatorio quando
  // a flag esta ligada — a validacao cruzada fica em validateEnv (env.schema.ts).
  FAULT_INJECTION_TOKEN: z.string().optional(),
  // Teto do atraso pedido na rota de latencia. Sem teto, um `delayMs` grande
  // seguraria workers do Fastify e viraria negacao de servico contra o proprio
  // staging que se queria medir.
  FAULT_INJECTION_MAX_DELAY_MS: z.coerce.number().int().positive().default(5_000),
};
