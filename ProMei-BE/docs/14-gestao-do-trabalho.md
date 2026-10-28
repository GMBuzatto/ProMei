# Gestão do Trabalho — ProMei

## Hierarquia

Épico → História → Task; Bugs à parte com prioridade própria. Ferramenta: GitHub Projects (grátis, junto do código) ou ClickUP.

## Épicos do MVP

1. Fundação (repo, CI, ambientes, modelo de dados);
2. Auth e permissionamento;
3. Empresas, planos e assinaturas;
4. Itens e armazém;
5. Comprovante de saída;
6. UI base (tema, layout, navegação);
7. Observabilidade e go-live.

## Template de task

```
## Contexto
Por que isso existe / a que história pertence.

## Problema
O que resolver.

## Resultado esperado
Comportamento observável ao concluir.

## Regras
RN-* e RF-* envolvidas (link para docs).

## Módulos/arquivos envolvidos
Ex.: apps/api/src/modules/inventory

## Critérios de aceite
- [ ] ...

## Riscos
O que pode quebrar.

## Como validar
Passos manuais + testes automatizados esperados.
```

## Definition of Ready

História só entra em desenvolvimento com: problema claro, critérios de aceite, regras mapeadas, dependências resolvidas.

## Definition of Done

- Código com testes (unit + integração quando toca banco);
- CI verde;
- Review aprovado;
- Documentação atualizada (docs/ e/ou README) se mudou comportamento;
- Validado em staging.

## Prioridade

`P0` bloqueia MVP · `P1` MVP · `P2` pós-MVP · `P3` ideia. Bugs em produção que afetam cliente pagante = P0.
