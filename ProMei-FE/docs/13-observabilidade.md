# Observabilidade — ProMei FE

Objetivo: a aplicação em produção deve conseguir explicar o que aconteceu.

## Logs

- Estruturados em JSON (Pino), níveis `info`/`warn`/`error`;
- Todo request recebe `correlation_id` (header `x-correlation-id`, propagado do web à API e devolvido em erros);
- Campos padrão: `correlation_id`, `company_id`, `user_id`, rota, status, duração;
- **Nunca** logar senha, token ou dados pessoais sensíveis.

## Erros

- Sentry (free tier) em API e Web, com release e correlation id;
- Todo 5xx vai ao Sentry; 4xx de negócio não (são esperados).

## Métricas e alertas (mínimo do MVP)

| Sinal | Alerta quando |
|---|---|
| Uptime (`/health` via UptimeRobot ou similar) | Down > 2 min |
| Taxa de erro 5xx | > 1% em 5 min |
| Latência p95 | > 1 s sustentado |
| Erros novos no Sentry | Primeiro evento de erro novo |
| Backup diário | Falhou |

Dashboards Grafana/Prometheus: fase 2 — as métricas do provedor + Sentry bastam no início.

## Auditoria

Tabela `audit_logs` append-only (detalhes em [09-seguranca.md](09-seguranca.md)) — responde "quem fez o quê, quando, em qual empresa".

## Health checks

- `/health`: processo vivo;
- `/health/ready`: banco acessível e migrações aplicadas.
