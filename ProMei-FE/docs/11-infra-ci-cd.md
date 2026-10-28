# Infraestrutura e CI/CD — ProMei FE

## Repositório

- GitHub, **multi-repo** (`ProMei-BE` e `ProMei-FE`) — ver [ADR-0004](adr/0004-multi-repo.md);
- Branches `development`, `staging` e `main` protegidas: PR + CI verde obrigatórios, sem push direto, sem force-push, sem deleção;
- Merge por squash apenas.

## Pipeline (GitHub Actions)

```
PR aberto ─▶ lint + typecheck ─▶ testes unit/integração ─▶ audit de dependências ─▶ build
merge em staging ─▶ build imagens Docker ─▶ deploy staging ─▶ smoke test
tag v* em main ─▶ deploy produção (aprovação manual) ─▶ migração ─▶ smoke test
```

Implementação: `.github/workflows/ci.yml` em cada repo. Os quatro jobs (`lint`, `test`,
`audit`, `build`) rodam em paralelo e são exigidos como *required status checks*.

### Gates que bloqueiam merge/deploy

- Lint/typecheck falhou;
- Teste falhou (incluindo teste de isolamento cross-tenant);
- Vulnerabilidade **crítica** em dependência (`pnpm audit --audit-level critical`; `high` é reportado no log para triagem);
- Migração sem rollback documentado (quando destrutiva);
- Branch desatualizada em relação à base (*strict status checks*: exige rebase/merge antes do merge).

### Proteção das branches

Definida como código em `.github/rulesets/*.json` e aplicada com
`scripts/setup-branch-protection.ps1` (ou `.sh`), que usa o GitHub CLI. Reaplicar o script
após qualquer alteração nos JSONs.

> Enquanto a equipe for de **um dev**, `required_approving_review_count` fica em `0` — o GitHub
> não permite que o autor aprove o próprio PR, e exigir 1 review travaria todo merge. O PR
> continua obrigatório e o auto-review fica documentado no próprio PR (ver
> [08-padroes-de-desenvolvimento.md](08-padroes-de-desenvolvimento.md)). Ao entrar o segundo
> dev, subir para `1` nos três rulesets.

#### ⚠️ Pendência aberta: proteção não está ativa no servidor

**Status em 2026-08-03:** os rulesets **não estão aplicados**. `XMahoraga/mahoraga-BE` é privado
no plano **Free**, e a API do GitHub responde `403 — Upgrade to GitHub Pro or make this
repository public` em `POST /repos/{owner}/{repo}/rulesets`.

Consequência prática: o CI roda e mostra os resultados no PR, mas **nada impede** merge com
check vermelho nem push direto em `main`. A garantia é hoje por disciplina, não por
ferramenta.

Desbloqueio (escolher um):

| Opção                        | Custo        | Efeito                                      |
| ---------------------------- | ------------ | ------------------------------------------- |
| GitHub Pro                   | ~US$ 4/mês   | Mantém privado e libera rulesets            |
| Tornar o repositório público | grátis       | Libera rulesets; expõe o código             |
| Manter Free                  | grátis       | Sem proteção server-side (situação atual)   |

Assim que uma das duas primeiras for adotada, rodar `scripts/setup-branch-protection.ps1` —
os JSONs já estão prontos e versionados. **Reavaliar antes do go-live**
([15-go-live.md](15-go-live.md)).

#### Paliativo: gate local de pre-push

Enquanto a pendência não é resolvida, `.githooks/pre-push` (instalado por `pnpm hooks:install`,
e automaticamente no `pnpm install` via script `prepare`):

- bloqueia push direto para `development`, `staging`, `main` e `master`;
- roda `format:check`, `lint`, `typecheck` e `test` antes de liberar o push;
- avisa (sem bloquear) se o `pnpm audit` acusar vulnerabilidade crítica.

Limitação honesta: um hook local é **contornável** (`git push --no-verify`, ou simplesmente
uma máquina onde ele não foi instalado). Serve para evitar erro por distração, não para
garantir política — isso só o servidor faz.

## Docker

- `Dockerfile` multi-stage por app (build → runtime slim);
- `docker-compose.yml` para dev local (api, web, postgres);
- Imagens versionadas por SHA + tag de release.

## Deploy

- Estratégia: rolling simples (parar réplica antiga após nova ficar healthy);
- Migrações Prisma executadas antes do switch, sempre compatíveis com a versão anterior (expand/contract);
- Rollback: redeploy da imagem anterior; migração destrutiva só depois de estabilizada.

## Health checks

- `GET /health` (liveness) e `GET /health/ready` (readiness: banco acessível);
- Provedor reinicia container unhealthy.

## Backup e desastre

- Backup automático diário do Postgres de produção, criptografado (GPG/AES-256),
  enviado para S3 com retenção de 30 dias — `.github/workflows/backup-postgres.yml`;
- Teste de restauração automatizado a cada backup: restaura o dump mais recente em
  um Postgres 16 novo/vazio (sem estado prévio) e valida schema sem drift
  (`prisma migrate status`) e contagem exata de linhas por tabela contra os
  metadados do backup — `.github/workflows/backup-restore-test.yml`;
- RPO 24 h / RTO 4 h (MVP) — revisar quando houver mais clientes; RTO medido pelo
  job cobre só dump→restore→validação, não decisão humana + cutover de produção;
- Secrets/vars necessários em um Environment **`backup`** dedicado no GitHub
  (não reaproveitar `production`, que tem aprovação manual obrigatória e
  travaria a execução agendada): `DATABASE_URL` (produção), `BACKUP_ENCRYPTION_KEY`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (var),
  `BACKUP_S3_BUCKET` (var);
- PDFs de comprovantes: regeneráveis a partir do banco (não são fonte de verdade).

### Fora de escopo (documentado, não implementado)

- DR da plataforma como um todo (Railway, filas, secrets) — só o banco;
- Alta disponibilidade/failover automático — isto é backup+restore, não HA;
- Validação semântica dos dados (só integridade estrutural: contagem de linhas +
  checksum do dump);
- Runbook de cutover de produção (o job testa restaurabilidade, não o
  procedimento real de incidente);
- Rotação da chave de criptografia (`BACKUP_ENCRYPTION_KEY` fica em GitHub Actions
  secret, sem rotação automatizada);
- Alerta dedicado de falha do pipeline além da notificação padrão do GitHub
  Actions para execuções agendadas com falha.
