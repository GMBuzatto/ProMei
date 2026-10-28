# ADR-0007: Rebrand de Mahoraga para GiroFácil

- Status: aceita
- Data: 2026-09-03

## Contexto

"Mahoraga" sempre foi codinome, nunca nome de produto. O commit `4decee2` já havia
renomeado 7 arquivos de código, deixando o repositório com os dois nomes convivendo — o
pior estado possível, porque nem serve de codinome consistente nem de marca.

O momento foi escolhido de propósito: **antes** dos módulos da fase 2 (clientes, vendas,
pagamentos, liberações, fechamento). Renomear 40 arquivos custa uma tarde; renomear 90
custa uma semana e gera conflito com todo trabalho em andamento.

## Decisão

O produto passa a se chamar **GiroFácil** em todo o repositório: código, documentação,
comentários, seed, nome do pacote, containers e banco de desenvolvimento.

### O que foi renomeado

| Onde | De | Para |
|---|---|---|
| `package.json` | `mahoraga-be` | `girofacil-be` |
| Papel restrito do banco | `mahoraga_app` | `girofacil_app` (migração `20260903090000`) |
| Banco/usuário de desenvolvimento | `mahoraga` | `girofacil` |
| Containers do compose | `mahoraga-api`, `mahoraga-db` | `girofacil-api`, `girofacil-db` |
| Volume do compose | `mahoraga-postgres-data` | `girofacil-postgres-data` |
| Projeto do compose | derivado da pasta (`mahoraga-be`) | `girofacil`, declarado em `name:` |
| E-mails do seed | `@mahoraga.dev` | `@girofacil.dev` |
| Senha do seed | `Mahoraga@123` | `GiroFacil@123` (ASCII: acento vira dor de cabeça em terminal e CI) |
| Documentação (docs/, README, CLAUDE.md) | Mahoraga | GiroFácil |
| Mockup compilado | `Mahoraga - Documentação.dc.html` | `GiroFacil - Documentação.dc.html` |

### O que NÃO foi renomeado, e por quê

| Item | Motivo |
|---|---|
| Migração `20260808130000_create_restricted_db_role` | Migração aplicada não se edita (docs/08): o checksum do Prisma quebraria em todo banco existente. A renomeação vem numa migração nova |
| Repositórios `mahoraga-BE` / `mahoraga-FE` | Nome externo, no GitHub. Docs referenciam o nome **real**; renomear lá é decisão à parte |
| Organização `XMahoraga` | Idem |
| Regra de lifecycle `mahoraga-postgres-backup-retention-30d` | ID de regra já aplicada no provedor; trocar no arquivo criaria uma segunda regra em vez de renomear a existente |
| Pasta local `mahoraga-BE` | Acompanha o nome do repositório |

## Consequências

### O nome do stack não vinha do compose

O Docker Desktop mostrava `mahoraga-be` mesmo com todos os containers já
renomeados: sem `name:` no topo do arquivo, o Compose deriva o nome do projeto do
**diretório**, e a pasta continua sendo `mahoraga-BE`. Corrigido com `name: girofacil`
explícito — assim o nome do stack deixa de depender de como o repositório foi clonado.

Consequência: o stack antigo (`mahoraga-be`) e o novo (`girofacil`) são projetos
**diferentes** para o Compose. O antigo precisa ser derrubado pelo nome dele.

### O banco de desenvolvimento precisa ser recriado

O volume do compose mudou de nome, então o `docker compose up` cria um volume **novo e
vazio**. Isso é intencional: renomear usuário e banco dentro de um volume existente exigiria
`ALTER ROLE`/`ALTER DATABASE` fora do fluxo de migração, e o banco local é descartável.

```bash
docker compose -p mahoraga-be down   # derruba o stack ANTIGO (nome antigo do projeto)
docker compose up -d db              # sobe o novo, ja como projeto `girofacil`
pnpm db:migrate:deploy
pnpm db:seed
```

O volume antigo (`mahoraga-postgres-data`) **não é apagado** por este passo. Quando não for
mais necessário: `docker volume rm mahoraga-postgres-data`.

### A senha do papel restrito não acompanha o rename

`ALTER ROLE ... RENAME` preserva a senha (scram-sha-256 não embute o nome do papel) — o que é
desejável em produção, porque a senha forte rotacionada pelo `bootstrap-db.ts` sobrevive. O
efeito colateral em desenvolvimento: o papel passa a se chamar `girofacil_app` mas continua
com a senha `mahoraga_app`, definida pela migração original.

Isso **não** foi corrigido dentro da migração de propósito. Migração que fixa senha conhecida
sobrescreveria a senha forte do ambiente gerenciado no primeiro `migrate deploy`, e deixaria o
papel com credencial pública entre o deploy e a próxima rotação. Senha de papel de banco é
**provisionamento**, não migração.

Consequências práticas:

- o teste de RLS provisiona a própria credencial pelo owner, antes de conectar
  (`test/integration/rls.integration.spec.ts`) — ficou mais correto do que era, já que antes
  dependia de uma senha escrita numa migração;
- para usar `psql` como o papel restrito no banco local, reprovisione a senha uma vez:

```bash
docker compose exec db psql -U girofacil -d girofacil \
  -c "ALTER ROLE girofacil_app WITH PASSWORD '<senha local>'"
```

### Produção e staging não são afetados pelo banco

`DATABASE_URL` é secret do provedor e continua apontando para o banco existente. O que muda
lá é apenas o papel restrito, pela migração `20260903090000` — que é um `RENAME`, preserva
grants, default privileges e a senha rotacionada pelo `bootstrap-db.ts` (scram-sha-256 não
embute o nome do papel).

### Pendências fora do repositório

- [ ] renomear os repositórios no GitHub (`mahoraga-BE` → `girofacil-BE`, idem FE);
- [ ] renomear a organização, se for o caso;
- [ ] atualizar o nome do serviço no Railway;
- [ ] atualizar o projeto no Sentry (ou aceitar que o nome antigo permanece no histórico);
- [ ] domínio e identidade visual — não são escopo desta ADR.

Enquanto essas pendências existirem, a documentação referencia os nomes **reais** dos
repositórios. Documentação que descreve um caminho inexistente é pior que documentação
desatualizada.

## Alternativas consideradas

**Renomear só a marca visível, mantendo identificadores técnicos.** Rejeitada: deixaria
`mahoraga_app` e `mahoraga` no banco para sempre, e todo desenvolvedor novo perguntaria a
mesma coisa. O custo de renomear identificador de banco só cresce.

**Adiar para depois da fase 2.** Rejeitada pelo motivo do contexto: o volume de arquivos
dobra, e o rebrand passaria a conflitar com trabalho em andamento.
