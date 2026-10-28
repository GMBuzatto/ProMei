# Estratégia de Testes — ProMei

## Pirâmide

| Nível | Ferramenta | Escopo | Quando roda |
|---|---|---|---|
| Unitário | Vitest/Jest | Services de negócio (regras RN-*), validadores | Todo PR |
| Integração | Jest + Supertest + Postgres (testcontainers) | Endpoints com banco real: auth, permissões, estoque | Todo PR |
| E2E | Playwright | Fluxos críticos no navegador | `main` e pré-release |
| Segurança | `pnpm audit` + teste de isolamento cross-tenant | Dependências e multi-tenancy | Todo PR |
| Performance | k6 (básico) | p95 das rotas principais | Pré-release |
| Manual de negócio | Usuários validadores (MEIs beta) | Fluxos reais | Antes do go-live |

## Fluxos críticos com E2E obrigatório

1. Login → dashboard;
2. Super Admin cria empresa + assinatura → Admin da empresa loga;
3. Cadastro de item → entrada → saída → comprovante PDF;
4. Colaborador sem permissão tenta ação restrita → bloqueado;
5. Usuário da empresa A não acessa dados da empresa B.

## Testes que valem ouro neste produto

- **Isolamento cross-tenant** (automatizado, roda em todo PR — inegociável);
- Estoque nunca negativo sob concorrência (duas saídas simultâneas do mesmo item);
- Tabela de decisão de acesso (empresa/assinatura × login/leitura/escrita) coberta por integração.

## O que bloqueia uma entrega

- Build ou qualquer teste do CI falhando;
- Vulnerabilidade crítica sem correção;
- Fluxos críticos (lista acima) sem passar;
- Migração não validada em staging;
- Rollback não documentado.
