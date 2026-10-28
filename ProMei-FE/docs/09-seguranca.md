# Segurança e Privacidade — ProMei FE

## Autenticação e autorização

- Senhas: argon2id (fallback bcrypt cost ≥ 12);
- JWT access 15 min + refresh 7 dias rotacionado (hash no banco, revogável);
- Bloqueio progressivo após tentativas falhas + rate limit no login;
- Autorização dupla: permissão (`recurso:ação`) **e** escopo de tenant em toda rota.

## Isolamento multi-tenant (risco nº 1 do produto)

- `company_id` obrigatório em toda tabela de negócio;
- Client Extension do Prisma injeta tenant automaticamente — nenhuma query manual sem escopo;
- Postgres RLS como segunda barreira;
- Teste automatizado de isolamento cross-tenant no CI (usuário da empresa A tentando acessar recurso da empresa B → 404).

## Proteções da aplicação

| Área | Medida |
|---|---|
| Injeção | ORM parametrizado; validação zod em toda entrada |
| XSS | Escape padrão do React; sanitização de campos ricos; CSP |
| CSRF | API stateless com JWT em header (não cookie) — se migrar p/ cookie, usar SameSite + token CSRF |
| Rate limiting | Global por IP + estrito em `/auth/*` |
| CORS | Allowlist explícita por ambiente |
| Headers | helmet: HSTS, X-Content-Type-Options, X-Frame-Options, CSP |
| Dependências | Dependabot + `pnpm audit` no CI; vulnerabilidade crítica bloqueia deploy |
| Secrets | Nunca no código; rotação ao menor sinal de vazamento |
| Criptografia | TLS 1.2+ em trânsito; disco criptografado no banco (provedor) |

## Auditoria

Registrar (tabela `audit_logs`, append-only): login/logout e falhas, CRUD de usuários/papéis/permissões, mudanças de assinatura, movimentações de estoque, ações de Super Admin sobre empresas. Campos: autor, empresa, ação, recurso, diff, IP, timestamp.

## LGPD

- Dados pessoais coletados: nome, e-mail, documento da empresa — mínimo necessário;
- Base legal: execução de contrato;
- Direitos do titular: exportação e exclusão sob demanda (processo manual no MVP, documentado);
- Retenção: empresa cancelada → dados retidos 90 dias → anonimização/exclusão;
- Backup: criptografado, retenção 30 dias.

## Threat model (fluxos críticos)

| Ameaça | Vetor | Mitigação |
|---|---|---|
| Vazamento cross-tenant | Query sem escopo de tenant | Client extension + RLS + teste automatizado |
| Tomada de conta | Credential stuffing | Rate limit, bloqueio progressivo, argon2 |
| Escalada de privilégio | Colaborador manipulando payload de papel | Permissões validadas server-side; papéis de sistema imutáveis |
| Abuso de Super Admin | Credencial de staff comprometida | MFA para staff (prioridade pós-MVP), auditoria de todas as ações de plataforma |
| Fraude em comprovante | Alteração de movimentação | Movimentações imutáveis (RN-22), numeração sequencial |

## Resposta a incidentes

1. Detectar (alerta/Sentry) → 2. Conter (revogar tokens/suspender acesso) → 3. Corrigir → 4. Comunicar afetados se houver dados pessoais (LGPD: avaliar notificação à ANPD) → 5. Post-mortem em `docs/incidentes/`.
