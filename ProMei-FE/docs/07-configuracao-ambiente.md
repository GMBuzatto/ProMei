# Configuração de Ambiente — ProMei FE

> Adaptado da versão original deste doc, escrita para o back-end (NestJS). O front-end
> (Next.js) tem uma superfície de configuração bem menor — a maioria dos valores de negócio
> vive na API, não aqui — mas segue a mesma regra: nada de valor pré-configurável hardcoded
> (ver [16-configuracao-sem-hardcode.md](16-configuracao-sem-hardcode.md)).

A aplicação lê configuração de variáveis de ambiente do Next.js. Variáveis expostas ao
navegador precisam do prefixo `NEXT_PUBLIC_`; qualquer variável sem esse prefixo só existe
no lado servidor (build/SSR) e nunca chega ao bundle do cliente.

## Setup inicial

```bash
# 1. Copiar o arquivo de exemplo
cp .env.example .env.local

# 2. Preencher as variáveis necessárias
# Edite o .env.local com seus valores reais

# 3. Rodar a aplicação
pnpm dev   # http://localhost:3000 (API deve estar rodando em :3001)
```

`.env.local` nunca é commitado (já no `.gitignore`); `.env.example` é a referência pública
sempre atualizada.

## Validação

Convenção adotada para este repositório: um validador Zod centralizado
(`src/lib/env.ts`), importado uma única vez na inicialização (ex.: layout raiz), que lê
`process.env`, valida tipo/obrigatoriedade e falha cedo com mensagem clara se algo estiver
faltando ou mal formatado — em vez de um `undefined` silencioso aparecendo em runtime no meio
de um componente.

```typescript
// src/lib/env.ts (implementado — ver 16-configuracao-sem-hardcode.md)
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  NEXT_PUBLIC_QUERY_STALE_TIME_MS: z.coerce.number().int().nonnegative().default(30_000),
  NEXT_PUBLIC_QUERY_RETRY: z.coerce.number().int().nonnegative().default(1),
});
```

O acesso a `process.env.NEXT_PUBLIC_*` precisa ser literal (`process.env.NEXT_PUBLIC_API_URL`),
nunca dinâmico (`process.env[chave]`): o Next.js faz substituição estática no bundle e não
resolve índice calculado.

## Variáveis reconhecidas

| Variável | Tipo | Exemplo | Obrigatória |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | URL | `http://localhost:3001/api/v1` | **Sim** |
| `NEXT_PUBLIC_API_TIMEOUT_MS` | Inteiro > 0 | `15000` | Não (padrão `15000`) |
| `NEXT_PUBLIC_QUERY_STALE_TIME_MS` | Inteiro ≥ 0 | `30000` | Não (padrão `30000`) |
| `NEXT_PUBLIC_QUERY_RETRY` | Inteiro ≥ 0 | `1` | Não (padrão `1`) |

Lista curta por natureza: o front-end não guarda secrets (DB, JWT, chaves de terceiros) —
essas vivem exclusivamente no back-end. Atualize esta tabela sempre que uma variável for
adicionada ao `.env.example`.

> ⚠️ Nunca colocar secrets em variável `NEXT_PUBLIC_*` — qualquer valor com esse prefixo é
> embutido no bundle JavaScript e fica visível a qualquer visitante do site.

## Adicionando nova variável

1. **Editar `.env.example`** (referência pública):
   ```env
   NEXT_PUBLIC_MINHA_VAR=valor-padrao
   ```
2. **Editar `src/lib/env.ts`** — adicionar o campo no schema Zod;
3. **Editar `.env.local`** (local, gitignored);
4. **Usar no código** via `import { env } from '@/lib/env'` — nunca `process.env.X` disperso
   pelos componentes;
5. **Atualizar a tabela acima** e, se for valor pré-configurável, o inventário em
   [16-configuracao-sem-hardcode.md](16-configuracao-sem-hardcode.md).

## Erros comuns

### ❌ "Variável não definida" no build ou no dev server
```bash
cp .env.example .env.local
```

### ❌ Variável some no cliente (fica `undefined` no browser)
Falta o prefixo `NEXT_PUBLIC_`. Sem ele, a variável só existe no lado servidor.

### ❌ URL inválida em `NEXT_PUBLIC_API_URL`
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1  # ✅ correto (com protocolo)
NEXT_PUBLIC_API_URL=localhost:3001/api/v1          # ❌ falha na validação Zod
```

## Desenvolvimento vs. Produção

**Local** (`.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

**Produção** (variável de ambiente/secret do provedor de deploy):
```env
NEXT_PUBLIC_API_URL=https://api.promei.com.br/api/v1
```

## Implementação

- **Schema Zod:** `src/lib/env.ts`;
- **Consumidores:** `src/lib/api/client.ts` (URL base + timeout) e `src/lib/query-client.ts`
  (`staleTime`/`retry`);
- **Referência pública:** `.env.example`.
