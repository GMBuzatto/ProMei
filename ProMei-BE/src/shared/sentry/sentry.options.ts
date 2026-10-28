import type { NodeOptions } from '@sentry/node';
import { z } from 'zod';
import { envValidationMap } from '../config/env.config';

/**
 * Subconjunto do env que interessa ao Sentry.
 *
 * As regras de validacao sao as MESMAS de `env.config.ts` — reaproveitadas, nao
 * reescritas. O `Sentry.init` roda antes do Nest subir (ver `src/instrument.ts`),
 * ou seja, antes de existir `ConfigService`; sem este pick a inicializacao leria
 * `process.env` cru e escaparia da validacao exigida pelo docs/16.
 */
const sentryEnvSchema = z.object({
  NODE_ENV: envValidationMap['NODE_ENV'] as z.ZodTypeAny,
  SENTRY_DSN: envValidationMap['SENTRY_DSN'] as z.ZodTypeAny,
  SENTRY_RELEASE: envValidationMap['SENTRY_RELEASE'] as z.ZodTypeAny,
  SENTRY_ENVIRONMENT: envValidationMap['SENTRY_ENVIRONMENT'] as z.ZodTypeAny,
  SENTRY_TRACES_SAMPLE_RATE: envValidationMap['SENTRY_TRACES_SAMPLE_RATE'] as z.ZodTypeAny,
});

export interface SentryBootstrapResult {
  /** `null` quando nao ha DSN — o app sobe sem Sentry, que e o normal em dev. */
  options: NodeOptions | null;
  /** Motivo de nao ter inicializado, ou avisos de configuracao a logar. */
  warnings: string[];
}

/**
 * Monta as opcoes do `Sentry.init` a partir do ambiente.
 *
 * Funcao pura de proposito: e ela que carrega as decisoes (qual environment,
 * quanto amostrar) e por isso e o que os testes exercitam — inicializar o SDK
 * de verdade num teste sujaria o processo inteiro.
 */
export function buildSentryOptions(rawEnv: NodeJS.ProcessEnv): SentryBootstrapResult {
  const parsed = sentryEnvSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return {
      options: null,
      warnings: [`Config do Sentry invalida, seguindo sem Sentry: ${detail}`],
    };
  }

  const env = parsed.data as {
    NODE_ENV: string;
    SENTRY_DSN?: string;
    SENTRY_RELEASE?: string;
    SENTRY_ENVIRONMENT?: string;
    SENTRY_TRACES_SAMPLE_RATE: number;
  };

  const dsn = env.SENTRY_DSN?.trim();
  // O environment do Sentry e quem separa os alertas de staging dos de producao.
  const environment = env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV;
  const warnings: string[] = [];

  if (!dsn) {
    if (env.NODE_ENV === 'production') {
      warnings.push('SENTRY_DSN ausente em producao: erros 5xx nao serao reportados.');
    }
    return { options: null, warnings };
  }

  const tracesSampleRate = env.SENTRY_TRACES_SAMPLE_RATE;

  if (tracesSampleRate === 0) {
    warnings.push(
      'SENTRY_TRACES_SAMPLE_RATE=0: sem tracing nao ha p95, ' +
        'entao o alerta de latencia do docs/13 fica sem sinal.',
    );
  }

  return {
    options: {
      dsn,
      environment,
      release: env.SENTRY_RELEASE?.trim() || undefined,
      tracesSampleRate,
      // Reduz risco de vazar dado pessoal para fora (LGPD, docs/09).
      // Invariante de seguranca, nao parametro: por isso nao vem do ambiente.
      sendDefaultPii: false,
    },
    warnings,
  };
}
