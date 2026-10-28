# ProMei BE — instruções para o Claude

- Gerenciador de pacotes: **somente `pnpm`**. Nunca usar `npm`/`npx` (usar `pnpm exec` no lugar de `npx`).
- `docs/` é a base de arquitetura do projeto — consultar antes de implementar. Índice em
  `docs/README.md`. Mais usados no dia a dia:
  - `docs/06-arquitetura.md` — C4, ERD, multi-tenancy, fluxos críticos
  - `docs/08-padroes-de-desenvolvimento.md`
  - `docs/03-requisitos.md`
  - `docs/09-seguranca.md`
  - Demais docs (`01`–`16`, `adr/`) conforme a fase do trabalho.
  - `docs/ProMei - Documentação.dc.html` é a versão compilada/estilizada (mockup de
    apresentação) de toda a documentação — bom para visão geral, mas os `.md` individuais
    são a fonte de verdade e é neles que qualquer atualização deve ser feita.
- Migrações de banco: somente via Prisma Migrate (`pnpm db:migrate`), versionadas no repositório — nunca editar migração já aplicada.
- **Nada de config hardcoded**: todo valor pré-configurável (timeout, TTL, rate limit,
  threshold) vem de variável de ambiente validada em `env.config.ts`, nunca de uma
  constante fixa no código. Ver [docs/16-configuracao-sem-hardcode.md](docs/16-configuracao-sem-hardcode.md).
- **Sempre usar o Cliente Prisma injetado**: Em todos os módulos (services, controllers, etc),
  você deve receber o cliente Prisma como dependência (`private readonly prisma: PrismaService`) e usá-lo para todas as operações de banco de dados.
