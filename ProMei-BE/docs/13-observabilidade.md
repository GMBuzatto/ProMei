# Observabilidade — ProMei

Objetivo: a aplicação em produção deve conseguir explicar o que aconteceu.

## Logs

- Estruturados em JSON (Pino), níveis `info`/`warn`/`error`;
- Todo request recebe `correlation_id` (header `x-correlation-id`, propagado do web à API e devolvido em erros);
- Campos padrão: `correlation_id`, `company_id`, `user_id`, rota, status, duração;
- **Nunca** logar senha, token ou dados pessoais sensíveis.

## Erros

- Sentry (free tier) em API e Web, com release e correlation id;
- Todo 5xx vai ao Sentry; 4xx de negócio não (são esperados).

### Inicialização do Sentry

O `Sentry.init` roda em [`src/instrument.ts`](../src/instrument.ts), importado como **primeira
linha** de `src/main.ts`. A ordem não é estilo: o `@sentry/node` instrumenta `http`/`fastify`
via OpenTelemetry e só consegue fazê-lo sobre módulos ainda não carregados. Inicializar dentro
de um `onModuleInit` do Nest chega tarde — o servidor HTTP já está de pé, nenhuma transação é
criada, e **sem transação não existe p95**, ou seja, o alerta de latência abaixo fica sem sinal.

O `SentryService` não inicializa nada: ele observa o cliente já criado, envia as exceções
(chamado pelo `AllExceptionsFilter`) e faz `flush` no shutdown — sem o flush, um container
derrubado logo após o erro leva o evento embora antes da entrega.

### Configuração (nunca hardcoded — docs/16)

| Variável | Papel | Staging | Produção |
|---|---|---|---|
| `SENTRY_DSN` | Destino dos eventos. Vazio = Sentry inativo | preenchido | preenchido |
| `SENTRY_ENVIRONMENT` | **Separa os alertas de staging dos de produção.** Existe à parte porque `NODE_ENV` não pode valer `staging` (Node trata tudo que não é `production` como dev) | `staging` | `production` |
| `SENTRY_RELEASE` | Versão reportada; no deploy, o SHA do commit | SHA | SHA |
| `SENTRY_TRACES_SAMPLE_RATE` | Amostragem de transações (0..1). **Em 0 não há p95** | `1` | `0.1` |
| `SENTRY_FLUSH_TIMEOUT_MS` | Espera pela entrega no shutdown | `2000` | `2000` |

## Métricas e alertas (mínimo do MVP)

| Sinal | Alerta quando |
|---|---|
| Uptime (`/health` via UptimeRobot ou similar) | Down > 2 min |
| Taxa de erro 5xx | > 1% em 5 min |
| Latência p95 | > 1 s sustentado |
| Erros novos no Sentry | Primeiro evento de erro novo |
| Backup diário | Falhou |

Dashboards Grafana/Prometheus: fase 2 — as métricas do provedor + Sentry bastam no início.

### Regras de alerta — valores exatos a configurar

Esta é a fonte de verdade das regras. O console é uma **transcrição** desta tabela; ao mudar um
limite aqui, reaplicar no console (e vice-versa não vale — mudança direta no console sem
atualizar este arquivo é considerada drift).

| # | Onde | Condição | Janela | Filtro | Ação |
|---|---|---|---|---|---|
| A1 | UptimeRobot (ou similar) | `GET {BASE}/api/v1/health` não retorna 200 | checagem a cada 60 s, alerta após 2 falhas (≈2 min) | — | e-mail + WhatsApp do plantão |
| A2 | UptimeRobot | `GET {BASE}/api/v1/health/ready` não retorna 200 | idem A1 | — | e-mail |
| A3 | Sentry → Metric alert | `failure_rate()` > `0.01` | 5 min | `environment` = ambiente | e-mail |
| A4 | Sentry → Metric alert | `p95(transaction.duration)` > `1000 ms` | 5 min, 2 janelas seguidas (“sustentado”) | `environment` = ambiente | e-mail |
| A5 | Sentry → Issue alert | *A new issue is created* | — | `environment` = ambiente | e-mail |
| A6 | Provedor de backup | job diário falhou | 24 h | — | e-mail |

A3 e A4 dependem de `SENTRY_TRACES_SAMPLE_RATE > 0`: são métricas de transação, não de evento
de erro. Com amostragem `0.1` em produção, a taxa continua estatisticamente válida, mas
lembre-se de que o denominador é amostrado.

## Ensaio dos alertas em staging

Alerta que nunca disparou é hipótese. Para provar cada regra sem esperar um incidente real, a
API expõe rotas de **injeção de falha**, desligadas por padrão.

### Travas (três, independentes)

1. `FAULT_INJECTION_ENABLED=false` (padrão) → as rotas respondem **404**, sem revelar que existem;
2. ligada, exigem o segredo `FAULT_INJECTION_TOKEN` (mín. 16 caracteres) no header `x-fault-token`,
   comparado em tempo constante;
3. **o boot falha** se a flag estiver ligada com `NODE_ENV=production` ou
   `SENTRY_ENVIRONMENT=production` — não existe combinação de headers que gere falha em produção.

O módulo é sempre registrado, em todos os ambientes: registrar condicionalmente deixaria o
roteamento diferente entre staging e produção, e aí o que se ensaia não seria o mesmo app que roda.

### Roteiro

Com `FAULT_INJECTION_ENABLED=true`, `FAULT_INJECTION_TOKEN=<segredo>` e
`SENTRY_ENVIRONMENT=staging` no ambiente de staging:

```bash
BASE=https://staging.exemplo/api/v1
TOKEN=<segredo>

# 0. Sentry está recebendo? (checklist do docs/15) — devolve o eventId
curl -sX POST "$BASE/observability/sentry-check" -H "x-fault-token: $TOKEN"

# A5 + A3. 5xx real: passa pelo filtro global, entra no log e sobe ao Sentry
curl -sX POST "$BASE/observability/fault/error" -H "x-fault-token: $TOKEN"

# A1/A2. 503 — mesmo status que tira a réplica de rotação, sem derrubar container
curl -sX POST "$BASE/observability/fault/unavailable" -H "x-fault-token: $TOKEN"

# A4. Latência: empurra o p95 acima de 1 s (teto: FAULT_INJECTION_MAX_DELAY_MS)
curl -sX POST "$BASE/observability/fault/latency" -H "x-fault-token: $TOKEN" \
  -H 'content-type: application/json' -d '{"delayMs": 1500}'
```

Para A3 (taxa > 1%) e A4 (p95 sustentado) um disparo único não basta — são **taxas sobre uma
janela**. Repita a chamada o suficiente para que a proporção cruze o limite dentro dos 5 min
(em staging, com tráfego baixo, poucas dezenas de chamadas bastam).

### Registro do ensaio

Cada regra só conta como verde no checklist do [15-go-live.md](15-go-live.md) com: data,
`correlation_id` usado, link do evento no Sentry e print/print-screen do alerta recebido.

| Regra | Data do ensaio | Correlation id | Alerta chegou? |
|---|---|---|---|
| A1 uptime | | | |
| A2 readiness | | | |
| A3 taxa 5xx | | | |
| A4 p95 latência | | | |
| A5 erro novo | | | |
| A6 backup | | | |

### Configuração de console (handoff — não está no código)

O que o repositório **não** faz por conta própria, e precisa ser feito uma vez por ambiente:

1. criar o projeto no Sentry e copiar o DSN para `SENTRY_DSN` do ambiente;
2. criar as regras A3, A4 e A5 conforme a tabela acima, cada uma com o filtro
   `environment` correspondente;
3. criar os monitores A1 e A2 no UptimeRobot apontando para as URLs de health;
4. configurar o alerta A6 no provedor de backup;
5. cadastrar os destinatários (plantão do [15-go-live.md](15-go-live.md));
6. rodar o roteiro acima e preencher a tabela de registro.

## Auditoria

Tabela `audit_logs` append-only (detalhes em [09-seguranca.md](09-seguranca.md)) — responde "quem fez o quê, quando, em qual empresa".

## Health checks

- `/health`: processo vivo;
- `/health/ready`: banco acessível e migrações aplicadas.
