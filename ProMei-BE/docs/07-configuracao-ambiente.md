# Configuração de Ambiente

A aplicação ProMei valida automaticamente as variáveis de ambiente na inicialização. A validação é **dinâmica**, baseada no arquivo `.env.example`.

## Setup inicial

```bash
# 1. Copiar o arquivo de exemplo
cp .env.example .env

# 2. Preencher as variáveis necessárias
# Edite o .env com seus valores reais

# 3. Rodar a aplicação
pnpm start:dev
```

## Validação Dinâmica

A aplicação executa **duas validações** em sequência:

### 1️⃣ Compliance (`validateEnvCompliance()`)
- Lê dinamicamente todas as variáveis do `.env.example`
- Verifica se todas estão presentes no `.env`
- Valida se as obrigatórias estão preenchidas
- **Permite variáveis opcionais vazias** (ex: `SENTRY_DSN`)

```typescript
// Em src/main.ts (bootstrap)
validateEnvCompliance(); // ← Executa antes de tudo
```

### 2️⃣ Schema Zod
- Valida tipos: `NODE_ENV`, `PORT`, `CORS_ORIGINS`, etc
- Transforma valores: CSV → array, string → número
- Aplica regras: `DATABASE_URL` é URL, `JWT_*_SECRET` mín. 16 chars

```typescript
// Em src/shared/config/env.schema.ts
export const envSchema = z.object({ ... });
export function validateEnv(config): Env { ... }
```

## Variáveis Reconhecidas

Variáveis conhecidas (definidas em `env.schema.ts`) recebem validação específica:

| Variável | Tipo | Padrão | Obrigatória |
| --- | --- | --- | --- |
| `NODE_ENV` | enum | development | Sim |
| `PORT` | number | 3001 | Sim |
| `API_PREFIX` | string | /api/v1 | Sim |
| `CORS_ORIGINS` | CSV | http://localhost:3000 | Sim |
| `DATABASE_URL` | URL | — | **Sim** |
| `JWT_ACCESS_SECRET` | string (16+) | — | **Sim** |
| `JWT_ACCESS_TTL` | number (segundos) | 900 (15min) | Sim |
| `JWT_REFRESH_SECRET` | string (16+) | — | **Sim** |
| `JWT_REFRESH_TTL` | number (segundos) | 604800 (7d) | Sim |
| `AUTH_MAX_LOGIN_ATTEMPTS` | number | 5 | Sim |
| `AUTH_LOCKOUT_DURATION_MS` | number | 900000 (15min) | Sim |
| `AUTH_LOGIN_RATE_LIMIT_MAX` | number | 5 | Sim |
| `AUTH_LOGIN_RATE_LIMIT_TTL_MS` | number | 60000 (1min) | Sim |
| `RATE_LIMIT_MAX` | number | 100 | Sim |
| `RATE_LIMIT_TTL_MS` | number | 60000 (1min) | Sim |
| `HEALTH_CHECK_TIMEOUT_MS` | number | 3000 | Sim |
| `LOG_LEVEL` | enum | info | Sim |
| `SENTRY_DSN` | string | — | **Não** |
| `SENTRY_RELEASE` | string | — | **Não** |

> Nenhum desses valores é hardcoded no código — todos vêm daqui. Ver [16-configuracao-sem-hardcode.md](16-configuracao-sem-hardcode.md) para a regra e o porquê.

**Variáveis não reconhecidas** são validadas como strings obrigatórias.

## Adicionando Nova Variável

1. **Editar `.env.example`** (reference pública)
   ```env
   MINHA_VAR=valor-padrao
   ```

2. **Editar `src/shared/config/env.schema.ts`** (se tem validação específica)
   ```typescript
   const envSchema = z.object({
     // ...
     MINHA_VAR: z.string().default('valor-padrao'),
   });
   ```

3. **Editar `.env`** (local, gitignored)
   ```env
   MINHA_VAR=meu-valor-real
   ```

4. **Usar no código**
   ```typescript
   const config = app.get(ConfigService<Env, true>);
   const minhaVar = config.get('MINHA_VAR', { infer: true });
   ```

A validação automaticamente reconhecerá a nova variável!

## Erros Comuns

### ❌ "Arquivo .env não encontrado"
```bash
cp .env.example .env
```

### ❌ "Variáveis faltando no .env"
Compare com `.env.example`:
```bash
diff .env.example .env
cp .env.example .env  # recopia se necessário
```

### ❌ "Variáveis vazias no .env"
Preencha todas as obrigatórias. Opcionais (como `SENTRY_DSN`) podem estar vazias.

### ❌ Tipo inválido (ex: PORT não é número)
```env
PORT=3001  # ✅ correto
PORT=abc   # ❌ erro
```

## Desenvolvimento vs. Produção

**Local** (`.env`):
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://promei:promei@localhost:5432/promei?schema=public
JWT_ACCESS_SECRET=dev-secret-16chars-min
JWT_REFRESH_SECRET=dev-secret-16chars-min
LOG_LEVEL=debug
SENTRY_DSN=
```

**Produção** (GitHub Secrets):
```env
NODE_ENV=production
DATABASE_URL=<secure>
JWT_ACCESS_SECRET=<strong-32chars>
JWT_REFRESH_SECRET=<strong-32chars>
LOG_LEVEL=warn
SENTRY_DSN=https://...
```

## Implementação

- **Compliance dinâmica:** `src/shared/config/env-compliance.ts`
- **Schema Zod:** `src/shared/config/env.schema.ts`
- **Bootstrap:** `src/main.ts` (chama `validateEnvCompliance()`)
- **Testes:** `src/shared/config/env-compliance.spec.ts` (8 cenários)

## FAQ

**P: Posso adicionar variáveis sem mexer no schema?**  
R: Sim! Adicione em `.env.example` e `.env`. A validação lê dinamicamente.

**P: Como gero secrets seguros para produção?**  
```bash
openssl rand -base64 32
```

**P: A aplicação inicia sem `.env`?**  
R: Não. Lança erro imediatamente no bootstrap.

**P: Posso deixar `SENTRY_DSN` vazio?**  
R: Sim, é opcional no schema.
