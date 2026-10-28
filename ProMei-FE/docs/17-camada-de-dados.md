# Camada de Dados — API client + TanStack Query

Como o front-end conversa com a API. Vale para **toda** chamada: nenhum componente ou hook
faz `fetch` direto (docs/08-padroes-de-desenvolvimento.md).

```
componente / hook de feature
        ↓
TanStack Query (cache, retry, invalidação)   src/lib/query-client.ts
        ↓
apiFetch / api.get|post|put|patch|delete     src/lib/api/client.ts
        ↓
fetch nativo → API (/api/v1)
```

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/env.ts` | Configuração validada por Zod (URL da API, timeout, defaults do Query) |
| `src/lib/api/client.ts` | `apiFetch` + atalhos `api.*`; correlation id, Bearer, refresh em 401 |
| `src/lib/api/api-error.ts` | `ApiError` — erro único da camada, sempre com `code` |
| `src/lib/api/business-error-code.ts` | Espelho dos códigos de negócio da API + códigos de cliente |
| `src/lib/api/error-message.ts` | `code` → mensagem em pt-BR para exibir |
| `src/lib/api/session-store.ts` | Access token (memória) e refresh token (localStorage) |
| `src/lib/api/correlation-id.ts` | Header `x-correlation-id` e geração do id |
| `src/lib/query-client.ts` | `QueryClient` com defaults e política de retry |
| `src/components/query-provider.tsx` | Provider + reação global à queda de sessão |
| `src/components/api-error-alert.tsx` | Exibição padrão de erro (mensagem + `code` + correlation id) |

## Correlation id

Toda requisição sai com `x-correlation-id`. O mesmo id aparece no log estruturado da API,
no Sentry e no `ApiError` que a tela exibe — um print do usuário vira uma busca só
(docs/13-observabilidade.md). Quando a resposta traz o header, ele vence sobre o id local:
a API pode gerar o próprio se a requisição chegar sem.

## Autenticação e refresh automático

- Access token (15 min) fica **em memória**; refresh token (7 dias, rotacionado e revogável)
  no `localStorage`. Racional e trade-off: `src/lib/api/session-store.ts` e docs/09-seguranca.md;
- `Authorization: Bearer` é anexado automaticamente quando há sessão;
- **401 → `POST /auth/refresh` → repete a requisição original uma vez.** A renovação é
  *single-flight*: cinco queries tomando 401 ao mesmo tempo disparam **um** refresh. Sem isso,
  como o refresh token é rotacionado no servidor, os perdedores da corrida usariam um token já
  invalidado e derrubariam a sessão de um usuário legítimo;
- Depois de um reload o access token some (vive em memória) mas o refresh sobrevive: o client
  renova **antes** de gastar uma requisição que tomaria 401 na certa;
- Refresh recusado ⇒ sessão encerrada, evento `promei:session-expired`, cache do Query
  limpo e redirect para `/login` (tratado uma única vez no `QueryProvider`);
- Rotas públicas (`/auth/login`, `/auth/refresh`) usam `auth: false` — não mandam Bearer nem
  entram no ciclo de refresh.

## Erros

Tudo que sai da camada é `ApiError`, sempre com `code`:

| Origem | `code` | `statusCode` |
|---|---|---|
| Envelope da API | `code` de negócio (`ESTOQUE_INSUFICIENTE`, `LIMITE_PLANO_EXCEDIDO`...) | o da resposta |
| Resposta fora do envelope (proxy, HTML de gateway) | `RESPOSTA_INVALIDA` | o da resposta |
| Rede/offline/CORS | `FALHA_DE_REDE` | `0` |
| Estouro de `NEXT_PUBLIC_API_TIMEOUT_MS` | `TIMEOUT` | `0` |
| Cancelamento (navegação, novo input) | `REQUISICAO_CANCELADA` | `0` |

Na tela, `<ApiErrorAlert error={error} />` mostra mensagem + `code` + correlation id. A
mensagem sai de `getErrorMessage`: usa a da API (mais específica — traz nome do item, limite
do plano) e só cai no mapa local quando a mensagem do servidor é técnica ou genérica demais.
A UI **nunca** deriva texto de `statusCode` — o contrato é o `code`.

## TanStack Query

- `staleTime`, `retry` e timeout vêm de env var (docs/16-configuracao-sem-hardcode.md);
- Query **não** repete em 4xx de negócio (`isClientFault`): validação, permissão e "não
  encontrado" não mudam de resposta na segunda tentativa;
- Mutation nunca repete — não é idempotente, e repetir pode duplicar uma saída de estoque;
- No servidor, um `QueryClient` novo por request; no navegador, singleton. Cache de servidor
  compartilhado vazaria dados entre tenants — risco nº 1 do produto (docs/09-seguranca.md).

## Usando em uma feature

```typescript
// src/features/items/api.ts
import { api } from "@/lib/api";

export function listItems(params: { page: number; limit: number }) {
  return api.get<Paginated<Item>>("/items", { query: params });
}

// src/features/items/hooks.ts
export function useItems(params: { page: number; limit: number }) {
  return useQuery({
    queryKey: ["items", params],
    queryFn: ({ signal }) => api.get<Paginated<Item>>("/items", { query: params, signal }),
  });
}
```

Repassar o `signal` do Query é o que faz a requisição ser cancelada quando o componente
desmonta ou os parâmetros mudam.

## Testes

`test/lib/api/client.test.ts` (Vitest, job `test` no CI) cobre os aceites do épico FE-1:
401 dispara refresh e repete a requisição, refresh único sob concorrência, sessão encerrada
quando o refresh é recusado, e `code` de negócio preservado para exibição.
