# Configuração sem Hardcode — ProMei

## Regra

Todo valor **pré-configurável/ajustável** (timeout, TTL, limite, threshold, tamanho de
página, etc.) vem de variável de ambiente validada via Zod (`env.config.ts` /
`env.schema.ts`) — nunca de uma constante hardcoded no código.

**Por quê:** um valor hardcoded só muda com deploy de código. O mesmo valor como env var
muda por configuração, sem tocar em código — e fica documentado em um único lugar
(`.env.example`) em vez de espalhado por `const`s em arquivos diferentes, que tendem a
dessincronizar entre si (ver "O bug que motivou esta doc" abaixo).

## O que conta como "pré-configurável"

| Cai na regra (→ env var) | Não cai na regra (hardcode ok) |
|---|---|
| Timeouts, TTLs, expirações de token | Regra de negócio fixa por requisito (RF-03: 5 tentativas é o *default*, mas configurável) |
| Rate limits (janela, máximo de requests) | Nomes de rotas, enums de domínio (`CompanyStatus`, `UserStatus`) |
| Tamanho de página, limites de paginação | Chaves de erro (`BusinessErrorCode`) |
| Portas, prefixos de API, origens CORS | Estrutura de payload/DTO |

Se a dúvida for "um dev vai querer mudar esse número sem mexer em código, em produção ou
em outro ambiente?" — se sim, é env var.

## Como adicionar

Mesmo fluxo de [07-configuracao-ambiente.md](07-configuracao-ambiente.md#adicionando-nova-variável):

1. `.env.example` — adiciona a chave com o valor padrão.
2. `src/shared/config/env.config.ts` — adiciona o validador Zod (`z.coerce.number()...` para
   números; TTLs sempre em unidade numérica — segundos ou ms — nunca string tipo `"15m"`,
   porque strings desse tipo não são reutilizáveis em cálculo de data).
3. `.env` — preenche o valor local.
4. No código, injeta `ConfigService<Env, true>` e lê via `config.get('CHAVE', { infer: true })`.

Exceção conhecida: decorators que rodam na definição da classe (ex. `@Throttle()` em
`auth.controller.ts`) executam **antes** do Nest montar o container de DI, então não dá
para injetar `ConfigService` ali. Nesses casos, usa-se a forma "resolvable" (função que só
roda em request-time, quando `process.env` já foi populado pelo `ConfigModule`) — ver
comentário em `auth.controller.ts`.

## Inventário atual (evitar duplicar constante já existente)

`.env.example` é o catálogo único e sempre atualizado de toda env var do repositório —
é ele que `env.schema.ts` lê em runtime para gerar o schema Zod (`buildDynamicEnvSchema()`),
então nunca fica desatualizado em relação ao que a aplicação realmente aceita. **Antes de
adicionar uma variável nova, abra o `.env.example` e confira se já não existe uma
equivalente** — a tabela abaixo é só um atalho para achar quem já lê cada uma; a lista de
nomes e defaults é sempre a do `.env.example`, não esta tabela.

| Env var | Onde é lida |
|---|---|
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `jwt.service.ts`, `refresh-token.service.ts` (mesma fonte para os dois — não duplicar) |
| `AUTH_MAX_LOGIN_ATTEMPTS` / `AUTH_LOCKOUT_DURATION_MS` | `auth.service.ts` |
| `AUTH_LOGIN_RATE_LIMIT_MAX` / `AUTH_LOGIN_RATE_LIMIT_TTL_MS` | `auth.controller.ts` (`@Throttle` em `/auth/*`) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_TTL_MS` | `shared.module.ts` (`ThrottlerModule.forRootAsync`, rate limit global) |
| `HEALTH_CHECK_TIMEOUT_MS` | `health.service.ts` |
| `PAGINATION_DEFAULT_LIMIT` / `PAGINATION_MAX_LIMIT` | `companies.service.ts`, `plans.service.ts` (mesma fonte para toda listagem paginada — não duplicar) |

Se esta tabela e o `.env.example` divergirem (uma var nova sem linha aqui, ou uma linha
para uma var removida), o `.env.example` vence — atualize a tabela para bater com ele.

## O bug que motivou esta doc

`RefreshTokenService` tinha `REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000` hardcoded,
uma cópia independente do `refreshTokenExpiry = '7d'` também hardcoded em `JwtService` —
dois valores que precisavam ficar sincronizados manualmente, sem nada garantindo isso.
Consolidados na mesma origem (`JWT_REFRESH_TTL`), o risco de drift desaparece.
