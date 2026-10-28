# Stakeholders e Responsabilidades — ProMei

## Papéis

| Papel | Responsável | Responsabilidade |
|---|---|---|
| Sponsor / Team ProMei (fundadores) | Direção do negócio, priorização, financiamento |
| Product Owner | Team ProMei (fundadores) | Backlog, critérios de aceite, validação de entregas |
| Tech Lead | _a definir_ | Arquitetura, padrões, revisão de código |
| Desenvolvedores | Team ProMei | Implementação, testes, documentação |
| QA | acumulado pelos devs (MVP) | Estratégia e execução de testes |
| DevOps / Infra | acumulado pelo Tech Lead (MVP) | CI/CD, ambientes, monitoramento |
| Usuários validadores | 2-3 MEIs parceiros (beta) | Validar fluxos reais antes do go-live |

## Matriz de decisão

| Decisão | Quem aprova |
|---|---|
| Requisitos e escopo | Product Owner |
| Arquitetura e stack | Tech Lead (registrado em ADR) |
| Aceite de entregas | Product Owner + usuário validador |
| Deploy em produção | Tech Lead |
| Resposta a incidentes | Tech Lead (responsável primário) |
| Preços e planos | Sponsor |

## Comunicação

- Decisões técnicas relevantes → ADR em `docs/adr/`;
- Mudanças de escopo → atualizar [02-escopo-e-mvp.md](02-escopo-e-mvp.md);
- Incidentes → post-mortem simples em `docs/incidentes/` (criar quando ocorrer o primeiro).
