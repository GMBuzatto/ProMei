import { z } from "zod";

/**
 * Configuração de ambiente do front-end, validada uma única vez no import.
 *
 * Regra (docs/16-configuracao-sem-hardcode.md): todo valor pré-configurável por ambiente
 * vem daqui — nunca de `process.env.X` espalhado pelos componentes nem de constante
 * hardcoded. Catálogo público em `.env.example`; tabela em docs/07-configuracao-ambiente.md.
 *
 * Os acessos a `process.env.NEXT_PUBLIC_*` precisam ser literais: o Next.js faz
 * substituição estática no bundle e não resolve acesso dinâmico (`process.env[key]`).
 */
const envSchema = z.object({
  /** URL base da API, já com o prefixo de versão (ex.: http://localhost:3001/api/v1). */
  NEXT_PUBLIC_API_URL: z.string().url(),
  /** Timeout de cada requisição HTTP, em ms. */
  NEXT_PUBLIC_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /** `staleTime` padrão do TanStack Query, em ms. */
  NEXT_PUBLIC_QUERY_STALE_TIME_MS: z.coerce.number().int().nonnegative().default(30_000),
  /** Número de retentativas de query do TanStack Query (mutations não repetem). */
  NEXT_PUBLIC_QUERY_RETRY: z.coerce.number().int().nonnegative().default(1),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_API_TIMEOUT_MS: process.env.NEXT_PUBLIC_API_TIMEOUT_MS,
  NEXT_PUBLIC_QUERY_STALE_TIME_MS: process.env.NEXT_PUBLIC_QUERY_STALE_TIME_MS,
  NEXT_PUBLIC_QUERY_RETRY: process.env.NEXT_PUBLIC_QUERY_RETRY,
});

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Configuração de ambiente inválida:\n${details}\n\n` +
      `Copie .env.example para .env.local e preencha os valores ` +
      `(ver docs/07-configuracao-ambiente.md).`,
  );
}

export const env = parsed.data;

export type Env = typeof env;
