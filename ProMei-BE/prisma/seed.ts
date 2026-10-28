import 'dotenv/config';
import { faker } from '@faker-js/faker';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, StockMovementType } from '../src/generated/prisma/client';
import * as argon2 from 'argon2';
import {
  ADMIN_ROLE_NAME,
  COLLABORATOR_ROLE_NAME,
  adminPermissionMatcher,
  collaboratorPermissionPairs,
} from '../src/shared/access/default-company-roles';
import { PERMISSION_ACTIONS, PERMISSION_RESOURCES } from '../src/shared/access/permission-catalog';

// Prisma 7: o client exige driver adapter e o .env nao e mais carregado sozinho.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Catalogo unico, compartilhado com o bootstrap de ambientes gerenciados.
const RESOURCES = PERMISSION_RESOURCES;
const ACTIONS = PERMISSION_ACTIONS;

// ASCII de proposito: senha com acento vira dor de cabeca em terminal, CI e
// cliente de banco que nao esteja em UTF-8.
const SEED_PASSWORD = 'ProMei@123';

async function hashPassword(password: string) {
  return argon2.hash(password);
}

async function seedPermissions() {
  const permissions = await Promise.all(
    RESOURCES.flatMap((resource) =>
      ACTIONS.map((action) =>
        prisma.permission.upsert({
          where: { resource_action: { resource, action } },
          update: {},
          create: { resource, action },
        }),
      ),
    ),
  );

  return permissions;
}

async function seedPlans() {
  const plans = [
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

  const created = new Map<string, Awaited<ReturnType<typeof prisma.plan.upsert>>>();

  for (const plan of plans) {
    const record = await prisma.plan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
    created.set(plan.name, record);
  }

  return created;
}

async function seedSuperAdmin(allPermissions: { id: string }[]) {
  const superAdminRole =
    (await prisma.role.findFirst({ where: { companyId: null, name: 'Super Admin' } })) ??
    (await prisma.role.create({ data: { name: 'Super Admin', isSystem: true, companyId: null } }));

  await Promise.all(
    allPermissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: superAdminRole.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: superAdminRole.id, permissionId: permission.id },
      }),
    ),
  );

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@promei.dev' },
    update: {},
    create: {
      email: 'superadmin@promei.dev',
      passwordHash: await hashPassword(SEED_PASSWORD),
      companyId: null,
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: superAdmin.id, roleId: superAdminRole.id },
  });

  await prisma.auditLog.create({
    data: {
      companyId: null,
      userId: superAdmin.id,
      action: 'seed',
      resource: 'platform',
      diff: { note: 'Super admin criado via seed' },
      ip: '127.0.0.1',
    },
  });

  return superAdmin;
}

/**
 * Papéis padrão da empresa no seed.
 *
 * A lista de permissões vive em `src/shared/access/default-company-roles` e é a
 * mesma que o `CompaniesService` usa ao provisionar por API. Estava duplicada
 * aqui; empresa criada por seed e por API precisam nascer idênticas, senão o
 * comportamento diverge justamente entre desenvolvimento e produção.
 */
async function seedCompanyPermissions(companyId: string) {
  const adminRole = await prisma.role.upsert({
    where: { companyId_name: { companyId, name: ADMIN_ROLE_NAME } },
    update: {},
    create: { companyId, name: ADMIN_ROLE_NAME, isSystem: true },
  });

  const collaboratorRole = await prisma.role.upsert({
    where: { companyId_name: { companyId, name: COLLABORATOR_ROLE_NAME } },
    update: {},
    create: { companyId, name: COLLABORATOR_ROLE_NAME, isSystem: true },
  });

  const { fullResources, readOnlyResources } = adminPermissionMatcher();
  const adminPermissions = await prisma.permission.findMany({
    where: {
      OR: [
        { resource: { in: fullResources } },
        { resource: { in: readOnlyResources }, action: 'read' },
      ],
    },
  });

  await Promise.all(
    adminPermissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: permission.id },
      }),
    ),
  );

  const collaboratorPermissions = await prisma.permission.findMany({
    where: { OR: collaboratorPermissionPairs() },
  });

  await Promise.all(
    collaboratorPermissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: collaboratorRole.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: collaboratorRole.id, permissionId: permission.id },
      }),
    ),
  );

  return { adminRole, collaboratorRole };
}

async function seedCompany(index: number, planId: string) {
  const document = `1000000000${String(index).padStart(3, '0')}`;
  const slug = `empresa-${index}`;
  const companyName = `${faker.company.name()} Ltda`;

  const company = await prisma.company.upsert({
    where: { document },
    update: {},
    create: { name: companyName, document, status: 'ACTIVE' },
  });

  await prisma.subscription.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      planId,
      status: 'ACTIVE',
      renewsAt: faker.date.soon({ days: 30 }),
    },
  });

  const { adminRole, collaboratorRole } = await seedCompanyPermissions(company.id);

  const admin = await prisma.user.upsert({
    where: { email: `admin@${slug}.promei.dev` },
    update: {},
    create: {
      companyId: company.id,
      email: `admin@${slug}.promei.dev`,
      passwordHash: await hashPassword(SEED_PASSWORD),
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  const collaborators = [];
  for (let i = 1; i <= 2; i += 1) {
    const collaborator = await prisma.user.upsert({
      where: { email: `colaborador${i}@${slug}.promei.dev` },
      update: {},
      create: {
        companyId: company.id,
        email: `colaborador${i}@${slug}.promei.dev`,
        passwordHash: await hashPassword(SEED_PASSWORD),
        status: 'ACTIVE',
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: collaborator.id, roleId: collaboratorRole.id } },
      update: {},
      create: { userId: collaborator.id, roleId: collaboratorRole.id },
    });

    collaborators.push(collaborator);
  }

  const units = ['un', 'cx', 'kg', 'l'];
  const items = [];
  for (let i = 1; i <= 5; i += 1) {
    const sku = `ITEM-${String(i).padStart(3, '0')}`;
    const initialStock = faker.number.int({ min: 20, max: 100 });

    const item = await prisma.item.upsert({
      where: { companyId_sku: { companyId: company.id, sku } },
      update: {},
      create: {
        companyId: company.id,
        sku,
        name: faker.commerce.productName(),
        unit: faker.helpers.arrayElement(units),
        price: Number(faker.commerce.price({ min: 5, max: 500 })),
        stock: initialStock,
        minStock: faker.number.int({ min: 5, max: 15 }),
        status: 'ACTIVE',
      },
    });

    items.push(item);
  }

  await seedInventoryHistory(company.id, admin.id, collaborators[0]?.id ?? admin.id, items);

  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      userId: admin.id,
      action: 'seed',
      resource: 'companies',
      diff: { note: 'Empresa sintética criada via seed' },
      ip: faker.internet.ipv4(),
    },
  });

  return company;
}

async function seedInventoryHistory(
  companyId: string,
  adminId: string,
  collaboratorId: string,
  items: { id: string; stock: number }[],
) {
  const existingReceipts = await prisma.receipt.count({ where: { companyId } });
  let nextReceiptNumber = BigInt(existingReceipts + 1);

  for (const item of items) {
    await prisma.stockMovement.create({
      data: {
        companyId,
        itemId: item.id,
        userId: adminId,
        type: StockMovementType.IN,
        quantity: item.stock,
        reason: 'Estoque inicial (seed)',
      },
    });

    const outQuantity = Math.min(faker.number.int({ min: 1, max: 5 }), item.stock);
    if (outQuantity <= 0) continue;

    const receipt = await prisma.receipt.create({
      data: {
        companyId,
        number: nextReceiptNumber,
        pdfUrl: null,
      },
    });
    nextReceiptNumber += 1n;

    await prisma.stockMovement.create({
      data: {
        companyId,
        itemId: item.id,
        userId: collaboratorId,
        receiptId: receipt.id,
        type: StockMovementType.OUT,
        quantity: outQuantity,
        reason: 'Venda balcão (seed)',
      },
    });

    await prisma.item.update({
      where: { id: item.id },
      data: { stock: { decrement: outQuantity } },
    });
  }
}

/**
 * Fase 2 (Cliente + Compras): os cenários representativos já estão escritos em
 * `prisma/seeds/phase-two-dataset.ts` — clientes em cada situação financeira,
 * vendas à vista e a prazo, pagamentos parciais, venda cancelada, venda liberada
 * e venda de período anterior recebida agora.
 *
 * Eles NÃO são criados aqui ainda porque as tabelas chegam com os épicos 9 e 10
 * (docs/32). Quando chegarem, este seed percorre `PHASE_TWO_CUSTOMERS` e
 * `PHASE_TWO_ANONYMOUS_SALES`, resolvendo os offsets de data com `resolveDate`.
 */
async function main() {
  console.warn('Seed: permissões...');
  const permissions = await seedPermissions();

  console.warn('Seed: planos...');
  const plans = await seedPlans();

  console.warn('Seed: super admin...');
  await seedSuperAdmin(permissions);

  console.warn('Seed: empresas sintéticas...');
  const planIds = [...plans.values()].map((plan) => plan.id);
  for (let i = 1; i <= 3; i += 1) {
    const planId = planIds[(i - 1) % planIds.length];
    if (!planId) throw new Error('Nenhum plano disponível para vincular à empresa sintética.');
    await seedCompany(i, planId);
  }

  console.warn('Seed concluído.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
