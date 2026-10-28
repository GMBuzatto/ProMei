import { QueryClient, isServer } from "@tanstack/react-query";
import { env } from "@/lib/env";
import { isApiError } from "@/lib/api";

/**
 * Não repetir o que já sabemos que vai falhar de novo: 4xx de negócio (validação,
 * permissão, não encontrado) e 401 — que já passou pelo refresh dentro do client.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.isClientFault) return false;
  return failureCount < env.NEXT_PUBLIC_QUERY_RETRY;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: env.NEXT_PUBLIC_QUERY_STALE_TIME_MS,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Mutation não é idempotente — repetir pode duplicar uma saída de estoque.
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * No servidor, um client novo por request (senão o cache vazaria entre usuários/tenants —
 * risco nº 1 do produto, docs/09-seguranca.md). No navegador, um singleton, para não perder
 * o cache num re-render do React durante o suspense inicial.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return createQueryClient();
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}
