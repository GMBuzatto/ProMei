# syntax=docker/dockerfile:1.7

# Build multi-stage (docs/11-infra-ci-cd.md): build -> runtime slim.
#
# `pnpm prune --prod` (em vez de reinstalar com --prod/--ignore-scripts na
# runtime) porque varios deps de producao tem build nativo aprovado em
# pnpm-workspace.yaml (onlyBuiltDependencies: argon2, @prisma/client, ...) —
# reinstalar com --ignore-scripts quebraria esses bindings nativos. O prune so
# remove pacotes, sem rodar scripts, preservando o que ja foi buildado.

FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
# postinstall (prisma generate) roda aqui: schema.prisma + prisma.config.ts
# presentes, prisma CLI disponivel (devDependency, install completo). Client
# gerado sem engine Rust (@prisma/adapter-pg) em src/generated/prisma.

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src ./src
COPY . .
RUN pnpm build
# --ignore-scripts: prune reexecuta o postinstall do projeto (prisma generate),
# que falharia aqui porque a CLI do prisma (devDependency) acabou de ser
# removida. O client ja foi gerado e compilado para dist/ no `pnpm build`.
RUN pnpm prune --prod --ignore-scripts

# CLI do Prisma isolada, so para `migrate deploy` no boot (docker-entrypoint.sh).
#
# Por que um estagio proprio em vez de reaproveitar node_modules: a runtime e
# podada para producao e o pacote `prisma` e devDependency — ele sumiria. E
# instalar a CLI de volta dentro de /app/node_modules arriscaria conflitar com
# @prisma/client. Aqui ela vive sozinha, com npm (arvore plana e autocontida,
# ao contrario dos symlinks do pnpm) e versao fixada na mesma do client.
FROM base AS migrator
WORKDIR /migrate
RUN npm init -y > /dev/null \
  && npm install --omit=dev --no-audit --no-fund prisma@7.9.1

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
# O schema engine da CLI do Prisma e um binario que linka OpenSSL; sem isso o
# `migrate deploy` morre no alpine antes de abrir conexao.
RUN apk add --no-cache openssl
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# env.schema.ts le .env.example em runtime para gerar o schema de validacao
# (docs/16-configuracao-sem-hardcode.md) — nao e so ferramenta de dev.
COPY --from=build /app/.env.example ./.env.example
# Migracoes + CLI isolada: o container aplica o schema no boot.
COPY --from=build /app/prisma ./prisma
COPY --from=migrator /migrate ./.migrate
COPY prisma.config.migrate.cjs ./.migrate/prisma.config.cjs
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
