# Plano de Go-Live — ProMei FE

## Checklist de produção

- [ ] Todos os gates de [12-estrategia-de-testes.md](12-estrategia-de-testes.md) passando;
- [ ] Teste de isolamento cross-tenant verde;
- [ ] Fluxos críticos E2E verdes em staging;
- [ ] Backup automático configurado e restauração testada;
- [ ] Rollback documentado e ensaiado (redeploy da imagem anterior);
- [ ] Health checks + alertas de uptime/erro ativos;
- [ ] Sentry recebendo eventos de staging;
- [ ] Secrets de produção configurados e fora do código;
- [ ] HTTPS + headers de segurança verificados (securityheaders.com);
- [ ] Rate limiting ativo em `/auth/*`;
- [ ] Seed de produção: planos cadastrados + usuário Super Admin criado com senha forte;
- [ ] Termos de uso e política de privacidade publicados (LGPD);
- [ ] 2-3 MEIs beta validaram os fluxos em staging.

## Migração de dados

Projeto novo — sem migração legada. Para os primeiros clientes beta, oferecer importação de itens via planilha CSV (processo manual assistido).

## Dia do go-live

1. Deploy via tag de release (aprovação manual);
2. Migrações aplicadas e verificadas;
3. **Teste de fumaça** (roteiro de 10 min): login super admin → criar empresa teste → login admin → criar item → entrada → saída → PDF → conferir auditoria → excluir empresa teste;
4. Monitorar Sentry + métricas por 2 h.

## Critérios para interromper o deploy (rollback imediato)

- Smoke test falhou em qualquer passo;
- Taxa de 5xx > 1% ou health check instável;
- Qualquer indício de vazamento cross-tenant (interrupção + investigação obrigatória).

## Plantão e comunicação

- Responsável de plantão na semana de lançamento: Tech Lead;
- Canal de suporte aos beta: WhatsApp direto (MVP);
- Incidente com dados pessoais → seguir resposta a incidentes em [09-seguranca.md](09-seguranca.md).
