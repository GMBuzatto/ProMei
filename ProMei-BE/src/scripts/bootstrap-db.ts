/**
 * Bootstrap do banco em ambiente gerenciado (Railway).
 *
 * Roda depois de `prisma migrate deploy`, no entrypoint do container, e é
 * idempotente de ponta a ponta — todo deploy passa por aqui sem efeito colateral.
 *
 * O que faz, e por quê:
 *
 * 1. Rotaciona a senha do papel restrito `promei_app`. A migração
 *    `20260808130000_create_restricted_db_role` cria o papel com senha de
 *    desenvolvimento hardcoded (está escrito lá: "em qualquer ambiente real,
 *    rode ALTER ROLE"). Este é o "ambiente real".
 * 2. Garante o catálogo de permissões e os planos padrão.
 * 3. Cria o Super Admin inicial, com senha vinda do ambiente e
 *    `mustChangePassword` ligado — o ovo-e-galinha de não haver ninguém para
 *    chamar a API de criação de usuário no primeiro deploy.
 *
 * Nenhuma dessas variáveis está em `.env.example` de propósito: elas são de
 * provisionamento, não de runtime da aplicação, e `env.schema.ts` derivaria
 * validação obrigatória delas para todo boot (docs/16).
 *
 * Variáveis lidas (todas opcionais — ausente = etapa pulada):
 *   DB_APP_ROLE_PASSWORD     senha forte para o papel `promei_app`
 *   SEED_SUPERADMIN_EMAIL    e-mail do Super Admin inicial
 *   SEED_SUPERADMIN_PASSWORD senha provisória do Super Admin inicial
 */
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../generated/prisma/client';
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  SUPER_ADMIN_ROLE_NAME,
} from '../shared/access/permission-catalog';

const APP_ROLE = 'promei_app';

/**
 * Planos iniciais. Só entram quando a tabela está vazia: preço é decisão
 * comercial e, uma vez ajustado via API (RF-21), um upsert cego reverteria a
 * mudança a cada deploy.
 */
const DEFAULT_PLANS = [
  {
    name: 'Starter',
    price: 49.9,
    period: 'monthly',
    // maxCustomers (PD-08, RN-14): mesma escala de maxItems.
    limits: { maxUsers: 3, maxItems: 100, maxCustomers: 50 },
  },
  {
    name: 'Pro',
    price: 149.9,
    period: 'monthly',
    limits: { maxUsers: 10, maxItems: 1000, maxCustomers: 500 },
  },
  {
    name: 'Enterprise',
    price: 399.9,
    period: 'monthly',
    limits: { maxUsers: 50, maxItems: 10000, maxCustomers: 5000 },
  },
];

function log(message: string): void {
  console.warn(`[bootstrap-db] ${message}`);
}

async function rotateAppRolePassword(prisma: PrismaClient): Promise<void> {
  const password = process.env.DB_APP_ROLE_PASSWORD;

  if (!password) {
    log(`DB_APP_ROLE_PASSWORD ausente. Papel ${APP_ROLE} segue com a senha da migração.`);
    return;
  }

  const [role] = await prisma.$queryRawUnsafe<{ rolname: string }[]>(
    `SELECT rolname FROM pg_roles WHERE rolname = '${APP_ROLE}'`,
  );

  if (!role) {
    log(`Papel ${APP_ROLE} não existe neste banco. Nada a rotacionar.`);
    return;
  }

  // ALTER ROLE não aceita parâmetro na senha; a única defesa é escapar a aspa
  // simples, dobrando-a, como manda o literal de string do Postgres.
  const escaped = password.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`ALTER ROLE ${APP_ROLE} WITH PASSWORD '${escaped}'`);
  log(`Senha do papel ${APP_ROLE} rotacionada.`);
}

async function ensurePermissions(prisma: PrismaClient): Promise<{ id: string }[]> {
  const permissions = await Promise.all(
    PERMISSION_RESOURCES.flatMap((resource) =>
      PERMISSION_ACTIONS.map((action) =>
        prisma.permission.upsert({
          where: { resource_action: { resource, action } },
          update: {},
          create: { resource, action },
        }),
      ),
    ),
  );

  log(`Catálogo de permissões garantido (${permissions.length}).`);
  return permissions;
}

async function ensurePlans(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.plan.count();

  if (existing > 0) {
    log(`Planos já cadastrados (${existing}). Preservados.`);
    return;
  }

  await prisma.plan.createMany({ data: DEFAULT_PLANS });
  log(`Planos padrão criados (${DEFAULT_PLANS.length}).`);
}

async function ensureSuperAdmin(
  prisma: PrismaClient,
  permissions: { id: string }[],
): Promise<void> {
  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!email || !password) {
    log('SEED_SUPERADMIN_EMAIL/PASSWORD ausentes. Super Admin inicial não criado.');
    return;
  }

  const role =
    (await prisma.role.findFirst({ where: { companyId: null, name: SUPER_ADMIN_ROLE_NAME } })) ??
    (await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE_NAME, isSystem: true, companyId: null },
    }));

  await Promise.all(
    permissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      }),
    ),
  );

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Nunca reescrever a senha de um usuário que já existe: o deploy seguinte
    // devolveria a conta para a senha provisória da variável.
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: existing.id, roleId: role.id } },
      update: {},
      create: { userId: existing.id, roleId: role.id },
    });
    log(`Super Admin ${email} já existe. Senha preservada.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(password),
      companyId: null,
      status: 'ACTIVE',
      mustChangePassword: true,
    },
  });

  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  await prisma.auditLog.create({
    data: {
      companyId: null,
      userId: user.id,
      action: 'bootstrap',
      resource: 'platform',
      diff: { note: 'Super Admin inicial criado no bootstrap do ambiente' },
      ip: '127.0.0.1',
    },
  });

  log(`Super Admin ${email} criado. Troca de senha obrigatória no primeiro acesso.`);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL não definida. O bootstrap não tem banco para configurar.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await rotateAppRolePassword(prisma);
    const permissions = await ensurePermissions(prisma);
    await ensurePlans(prisma);
    await ensureSuperAdmin(prisma, permissions);
    log('Concluído.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[bootstrap-db] falhou:', error);
  process.exit(1);
});
