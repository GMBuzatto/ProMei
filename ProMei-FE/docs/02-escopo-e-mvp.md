# Escopo e MVP — ProMei FE

## Dentro do MVP (v1)

1. **Auth**: login com e-mail/senha, sessão via JWT (access + refresh), recuperação de senha manual (feita pelo admin, sem e-mail no MVP).
2. **Permissionamento**: papéis Super Admin/Staff (plataforma) e Admin/Colaborador (empresa), com CRUD de papéis e permissões por recurso.
3. **CRUD de empresas** (tenants): criação, edição, ativação/suspensão — feito pelo Super Admin.
4. **Planos e assinaturas**: cadastro de planos (mensal/anual), vínculo empresa↔plano, controle de status (ativa, inadimplente, cancelada). Cobrança **manual** no MVP (sem gateway).
5. **CRUD de itens genéricos**: nome, descrição, SKU/código, unidade, preço, quantidade em estoque, categoria.
6. **Gestão de armazém**: entrada e saída de estoque, ajuste manual, histórico de movimentações.
7. **Saída com comprovante ("nota fria")**: registro de saída gera comprovante genérico imprimível/PDF (sem valor fiscal).
8. **Painel web**: Next.js + Tailwind, responsivo, dark/light.

## Fora do MVP (não faremos agora)

- Register self-service (empresas são criadas pelo Super Admin);
- Envio de e-mails / mensageria;
- Emissão de NFS-e;
- Gateway de pagamento / cobrança automática;
- Gestão de funcionários (RH);
- App mobile;
- Relatórios avançados / BI;
- Multi-idioma (somente pt-BR).

## Funcionalidades obrigatórias vs. futuras

| Obrigatória (v1) | Futura |
|---|---|
| Auth + permissionamento | Register self-service |
| CRUD empresas + assinaturas (manual) | Cobrança automática (gateway) |
| CRUD itens + estoque | NFS-e |
| Saída com comprovante | Mensageria de e-mail |
| Dark/light, responsivo | Gestão de funcionários |

## Critérios de aceite do MVP (alto nível)

- Super Admin cria uma empresa, um plano e vincula assinatura;
- Admin da empresa faz login, cadastra colaborador e define permissões;
- Colaborador cadastra item, registra entrada e saída de estoque;
- Saída gera comprovante em PDF;
- Um usuário de uma empresa **nunca** vê dados de outra empresa;
- Interface funciona em mobile e desktop, dark e light.

## Restrições

- **Equipe**: pequena (1-2 devs) — priorizar simplicidade e monolito modular;
- **Custo**: infraestrutura mínima (1 VPS/serviço gerenciado barato + Postgres);
- **Prazo**: MVP funcional antes de qualquer feature futura.

## Backlog inicial (macro)

1. Setup de repositório, CI e ambientes
2. Modelagem do banco + migrações
3. Auth (login, refresh, logout)
4. Permissionamento (papéis, permissões, guards)
5. CRUD empresas + planos + assinaturas
6. CRUD itens
7. Movimentação de estoque (entrada/saída/ajuste)
8. Comprovante de saída (PDF)
9. UI base (layout, tema, navegação)
10. Telas dos CRUDs + dashboard simples
11. Observabilidade mínima + deploy de produção
