# Ambientes — ProMei FE

| Ambiente | Propósito | Infra | Dados |
|---|---|---|---|
| Local (dev) | Desenvolvimento | Docker Compose (api, web, postgres) | Seed sintético |
| Homologação (staging) | Validação antes de produção | Mesma infra de produção, menor | Seed + dados de teste; **nunca** dados reais |
| Produção | Clientes reais | VPS/PaaS + Postgres gerenciado | Reais, com backup |

## Princípios

- Paridade: mesmas versões de Node/Postgres e mesmas variáveis (valores diferentes) em todos os ambientes — `docker-compose` local espelha produção;
- Configuração 100% por variável de ambiente, validada no boot;
- `pnpm dev` deve subir tudo localmente em um comando (compose + migração + seed);
- Staging recebe deploy automático de merges na branch `staging`; produção via aprovação manual (tag `v*` em `main`) — ver [11-infra-ci-cd.md](11-infra-ci-cd.md).

## Futuro (quando fizer sentido)

- Preview por pull request (Vercel/Railway);
- Sandbox de integrações quando entrarem pagamento e NFS-e.
