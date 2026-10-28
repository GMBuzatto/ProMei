# Requisitos — ProMei FE

## Requisitos funcionais

### Autenticação (RF-AUTH)
- RF-01: Login com e-mail e senha.
- RF-02: Tokens JWT (access curto + refresh) com renovação e logout.
- RF-03: Bloqueio temporário após 5 tentativas falhas.
- RF-04: Troca de senha pelo próprio usuário; reset feito por um admin (sem e-mail no MVP).

### Permissionamento (RF-PERM)
- RF-10: Papéis de plataforma: Super Admin, Staff.
- RF-11: Papéis de empresa: Admin, Colaborador.
- RF-12: CRUD de papéis customizados por empresa com permissões por recurso e ação (ex.: `itens:criar`, `estoque:saida`).
- RF-13: Toda rota da API valida permissão; toda query é filtrada pelo tenant.

### Empresas e assinaturas (RF-EMP)
- RF-20: Super Admin cria/edita/suspende/reativa empresas.
- RF-21: CRUD de planos (nome, preço, periodicidade mensal/anual, limites — ex.: nº de usuários, nº de itens).
- RF-22: Vínculo empresa↔plano com status: `trial`, `ativa`, `inadimplente`, `cancelada`.
- RF-23: Empresa suspensa/inadimplente perde acesso ao painel (somente leitura ou bloqueio total — regra em [04-regras-de-negocio.md](04-regras-de-negocio.md)).

### Itens e armazém (RF-ITEM)
- RF-30: CRUD de itens: nome, descrição, código/SKU, unidade, categoria, preço, estoque mínimo.
- RF-31: Consulta com busca, filtro por categoria e paginação.
- RF-32: Entrada, saída e ajuste de estoque, sempre com registro de quem/quando/quantidade/motivo.
- RF-33: Saída gera comprovante genérico (PDF) com dados da empresa, itens, quantidades e valores.
- RF-34: Histórico de movimentações por item e por período.
- RF-35: Alerta visual de estoque abaixo do mínimo.

### Futuro (não MVP)
- RF-90: Register self-service com verificação de e-mail.
- RF-91: Mensageria de e-mail (boas-vindas, reset de senha, alertas).
- RF-92: Emissão de NFS-e.
- RF-93: Pagamentos embutidos.

## Requisitos não funcionais

| ID | Categoria | Requisito |
|---|---|---|
| RNF-01 | Segurança | Senhas com bcrypt/argon2; secrets fora do código; HTTPS obrigatório; OWASP Top 10 mitigado |
| RNF-02 | Isolamento | Multi-tenant: dados de uma empresa jamais acessíveis por outra (tenant_id em toda tabela de negócio + escopo em toda query) |
| RNF-03 | Performance | p95 < 500 ms nas rotas principais com até 100 empresas ativas |
| RNF-04 | Escalabilidade | Monolito modular stateless, escalável horizontalmente; Postgres gerenciado |
| RNF-05 | Disponibilidade | Alvo 99,5% (MVP); health checks; restart automático |
| RNF-06 | Auditoria | Ações críticas (login, CRUD de usuários/permissões, movimentações de estoque, assinaturas) registradas com autor, timestamp e dados alterados |
| RNF-07 | Observabilidade | Logs estruturados (JSON) com correlation id; métricas básicas; rastreamento de erros |
| RNF-08 | Privacidade/LGPD | Coleta mínima de dados pessoais; direito de exclusão; ver [09-seguranca.md](09-seguranca.md) |
| RNF-09 | Compatibilidade | Últimas 2 versões de Chrome/Firefox/Safari/Edge; responsivo ≥ 360 px |
| RNF-10 | Recuperação | Backup diário do banco; RPO 24 h; RTO 4 h (MVP) |
| RNF-11 | Usabilidade | Dark/light; fluxo de saída de estoque em ≤ 3 cliques a partir do dashboard |
