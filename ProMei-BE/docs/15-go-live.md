# Plano de Go-Live — ProMei

## Checklist de produção

- [ ] Todos os gates de [12-estrategia-de-testes.md](12-estrategia-de-testes.md) passando;
- [ ] Teste de isolamento cross-tenant verde;
- [ ] Fluxos críticos E2E verdes em staging;
- [ ] Backup automático configurado e **restauração testada** — ver [Ensaio de restauração](#ensaio-de-restauração-de-backup);
- [ ] Rollback documentado e **ensaiado** — ver [Ensaio de rollback](#ensaio-de-rollback);
- [ ] Health checks + alertas de uptime/erro ativos — regras A1–A6 configuradas **e ensaiadas**
      conforme o roteiro de [13-observabilidade.md](13-observabilidade.md#ensaio-dos-alertas-em-staging);
- [ ] Sentry recebendo eventos de staging (`POST /observability/sentry-check` devolveu `eventId`);
- [ ] `FAULT_INJECTION_ENABLED=false` no ambiente de produção (o boot recusa `true`, mas confira);
- [ ] Secrets de produção configurados e fora do código;
- [ ] HTTPS + headers de segurança verificados (securityheaders.com);
- [ ] Rate limiting ativo em `/auth/*`;
- [ ] Seed de produção: planos cadastrados + usuário Super Admin criado com senha forte;
- [ ] **Empresa de smoke provisionada** em staging e em produção — ver [Empresa de smoke](#empresa-de-smoke);
- [ ] `SMOKE_ADMIN_EMAIL` (variável) e `SMOKE_ADMIN_PASSWORD` (secret) configurados nos dois ambientes;
- [ ] Termos de uso e política de privacidade publicados (LGPD);
- [ ] 2-3 MEIs beta aprovados conforme o [Protocolo de beta](#protocolo-de-beta-com-meis).

## Teste de fumaça

Existem **dois** testes, e a distinção importa:

| Teste | O que prova | Onde |
| --- | --- | --- |
| Liveness | o processo subiu e alcança o banco | `.github/actions/smoke-test` (poll em `/health/ready`) |
| Fluxo | o cliente consegue usar o produto | `scripts/smoke-test.sh` |

Um deploy pode passar no primeiro com a autenticação quebrada, o estoque não descontando ou o
comprovante não gerando. Por isso os dois rodam, nesta ordem, em **staging, produção e rollback**.

### Roteiro (o que `scripts/smoke-test.sh` executa)

| # | Passo | Resultado esperado |
| --- | --- | --- |
| 1 | `GET /health` | `200` |
| 2 | `GET /health/ready` | `200` — banco acessível e migrações aplicadas |
| 3 | `POST /auth/login` com o admin de smoke | `200` + `accessToken` |
| 4 | `POST /items` | `201` + `id` |
| 5 | `POST /stock-movements` entrada de 10 | `201`, saldo = 10 |
| 6 | `POST /stock-movements` saída de 4 | `201`, saldo = 6, comprovante criado |
| 7 | `POST /stock-movements` saída de 999 | `422 ESTOQUE_INSUFICIENTE` |
| 8 | `GET /receipts/:id/pdf` | `200` e bytes começando em `%PDF` |
| 9 | `GET /audit-logs?action=stock-movement.created` | `total > 0` |
| 10 | `PATCH /items/:id/status` para `INACTIVE` | `200` |

O passo 7 existe porque os outros só exercitam o caminho feliz: sem ele, um bug que aceitasse
estoque negativo passaria no smoke inteiro.

O passo 8 tem espera embutida — o PDF é gerado **depois** da resposta da movimentação
(`pdfStatus: PENDING`). Sem a espera, o teste falharia por corrida em vez de por defeito.

O passo 10 inativa em vez de excluir: o item tem movimentações, e movimentação é imutável (RN-22).

Execução manual:

```bash
BASE_URL=https://staging.exemplo/api/v1 \
SMOKE_ADMIN_EMAIL=smoke@empresa-smoke.promei \
SMOKE_ADMIN_PASSWORD='...' \
scripts/smoke-test.sh
```

Falha em qualquer passo é **critério de rollback imediato** — o script sai com código 1 e imprime
o `correlation_id` da requisição que falhou, que é por onde se procura no log e no Sentry.

### Empresa de smoke

O roteiro roda contra uma empresa **pré-existente e reutilizada**, não contra uma criada e
apagada a cada deploy. Duas razões: em produção isso mexeria em dados reais a cada release, e
cada execução deixaria rastro de `company.provisioned` na trilha de auditoria, poluindo
justamente o registro que serve para investigar incidente.

Provisionar uma vez por ambiente, autenticado como Super Admin:

```bash
curl -X POST "$BASE_URL/companies" \
  -H "authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "name": "Empresa de Smoke",
    "document": "00000000000191",
    "segment": "OTHER",
    "adminEmail": "smoke@empresa-smoke.promei",
    "adminPassword": "<gerar senha forte e guardar em SMOKE_ADMIN_PASSWORD>"
  }'
```

Em seguida, **fazer o primeiro login e trocar a senha**: o admin nasce com `mustChangePassword`
(RF-04) e o smoke falharia no passo 3 enquanto a troca estiver pendente. A senha final é a que vai
para o secret `SMOKE_ADMIN_PASSWORD`.

O item criado pelo smoke acumula — um por deploy, todos inativos. Se incomodar, limpar
periodicamente é seguro; o histórico de movimentação permanece.

## Ensaio de rollback

Rollback documentado não é rollback ensaiado. O ensaio é obrigatório **antes** do go-live e vale
para o checklist só com o registro preenchido.

1. Anotar o `deployment_id` da versão atualmente em staging;
2. Fazer um deploy qualquer em staging (pode ser um commit trivial);
3. Disparar o workflow `rollback.yml` apontando para o `deployment_id` anterior;
4. Conferir que **os dois** smokes passaram no fim do workflow;
5. Confirmar na aplicação que a versão anterior está no ar.

| Item | Valor |
| --- | --- |
| Data do ensaio | |
| `deployment_id` de origem | |
| `deployment_id` de destino | |
| Tempo até o serviço voltar | |
| Smoke de fluxo pós-rollback | ☐ verde |
| Quem executou | |

## Ensaio de restauração de backup

Backup que nunca foi restaurado é hipótese, pela mesma razão dos alertas (docs/13).

1. Rodar o workflow `backup-restore-test.yml`;
2. Restaurar em um banco descartável, **nunca** por cima de staging ou produção;
3. Conferir contagens de `companies`, `users`, `items` e `stock_movements` contra a origem;
4. Conferir que a última movimentação restaurada bate com a última da origem.

| Item | Valor |
| --- | --- |
| Data do ensaio | |
| Backup usado (data/hora) | |
| Tempo até restaurar | |
| Divergência encontrada | |
| RPO real observado | |

RPO alvo 24 h e RTO 4 h ([11-infra-ci-cd.md](11-infra-ci-cd.md)) — se o tempo medido aqui não
couber, o alvo é que está errado, não a medição.

## Protocolo de beta com MEIs

"2-3 MEIs validaram" só quer dizer alguma coisa se estiver definido **o que** eles validaram e
**o que conta como aprovado**. Sem isso o item vira carimbo.

### Quem convidar

Dois a três MEIs que já controlam estoque hoje de algum jeito (caderno, planilha, ou nada) e que
tenham pelo menos ~20 itens distintos. MEI sem estoque não exercita o produto. Evitar convidar
quem já conhece o projeto: quem sabe onde clicar não descobre onde os outros travam.

### Ambiente

Staging, com empresa própria provisionada por `POST /companies` — a mesma rota da produção. Beta
em ambiente especial testa um produto que não existe.

### Tarefas (observáveis, sem instrução prévia)

Peça o resultado, não o caminho. Cronometre e anote onde a pessoa trava.

| # | Tarefa | Fluxo coberto | Meta |
| --- | --- | --- | --- |
| 1 | Entrar no sistema pela primeira vez | RF-03, RF-04 (troca de senha) | < 3 min |
| 2 | Cadastrar 5 itens do seu estoque real | RF-30, RN-25 | < 10 min |
| 3 | Registrar a entrada de uma compra que você fez | RF-32 | < 2 min |
| 4 | Registrar uma venda de balcão | RF-32, RF-33 | **< 1 min** (métrica do docs/01) |
| 5 | Mostrar o comprovante dessa venda ao cliente | RF-33, RN-24 | < 1 min |
| 6 | Descobrir quanto você tem de um item específico | RF-30 | < 1 min |
| 7 | Descobrir o que saiu do estoque ontem | RF-34 | < 2 min |
| 8 | Cadastrar um funcionário que só registra vendas | RF-11, RF-12 | < 3 min |

A tarefa 4 tem meta explícita porque é a métrica de produto do
[01-visao-do-produto.md](01-visao-do-produto.md): saída de estoque em menos de 1 minuto.

### Como registrar

Uma linha por tarefa e por participante:

| MEI | Tarefa | Concluiu sozinho? | Tempo | Onde travou | Disse o quê |
| --- | --- | --- | --- | --- | --- |

Registre a frase da pessoa, não a sua interpretação dela. "Não achei onde põe a quantidade" é
dado; "achou a interface confusa" é opinião sua.

Ao final de cada sessão, duas perguntas abertas:

1. O que você faria diferente amanhã por causa disso?
2. O que faltou para você largar o caderno?

### Critério de aprovação

O item do checklist fica verde quando, **em pelo menos 2 dos 3 participantes**:

- as tarefas 1 a 5 foram concluídas **sem ajuda**;
- a tarefa 4 ficou abaixo de 1 minuto;
- nenhum defeito de severidade alta ficou aberto — vazamento entre empresas, saldo errado,
  comprovante não gerado ou perda de dado. Qualquer um destes **reprova sozinho**, mesmo com todas
  as tarefas concluídas;
- os defeitos médios e baixos estão registrados com dono e prazo, ainda que não corrigidos.

Se dois participantes travarem na mesma tarefa, isso não é problema deles — é escopo de correção
antes do go-live.

### Registro

| MEI | Segmento | Data da sessão | Tarefas 1-5 sem ajuda | Tarefa 4 (tempo) | Defeitos altos | Aprovou? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

## Migração de dados

Projeto novo — sem migração legada. Para os primeiros clientes beta, oferecer importação de itens
via planilha CSV (processo manual assistido).

## Onboarding de cliente

Empresa nasce por `POST /companies` (RF-20), que provisiona em uma transação: empresa, papéis
Admin e Colaborador com suas permissões (RF-11), o primeiro usuário admin e — se houver plano — a
assinatura. Não existe empresa criada pela metade: ou nasce utilizável, ou não nasce.

O admin recebe `mustChangePassword` e troca a senha no primeiro acesso (RF-04), então a senha
inicial pode ser transmitida por canal simples e perde valor no primeiro login.

> Self-service register continua fora do MVP ([01-visao-do-produto.md](01-visao-do-produto.md)).
> O onboarding é feito pelo Super Admin, pela API — não por script contra o banco.

## Dia do go-live

1. Deploy via tag de release (aprovação manual);
2. Migrações aplicadas e verificadas;
3. **Liveness** automático (`/health/ready`) e **smoke de fluxo** (`scripts/smoke-test.sh`), ambos
   no próprio workflow — o roteiro completo está em [Teste de fumaça](#teste-de-fumaça);
4. Monitorar Sentry + métricas por 2 h.

## Critérios para interromper o deploy (rollback imediato)

- Smoke test falhou em qualquer passo;
- Taxa de 5xx > 1% ou health check instável;
- Qualquer indício de vazamento cross-tenant (interrupção + investigação obrigatória).

## Plantão e comunicação

- Responsável de plantão na semana de lançamento: Tech Lead;
- Canal de suporte aos beta: WhatsApp direto (MVP);
- Incidente com dados pessoais → seguir resposta a incidentes em [09-seguranca.md](09-seguranca.md).
