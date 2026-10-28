/**
 * Catálogo de permissões da plataforma: o produto cartesiano
 * `recurso x ação` que precisa existir na tabela `permissions` antes de
 * qualquer papel poder ser montado.
 *
 * Vivia duplicado em `prisma/seed.ts` e agora também é usado pelo bootstrap de
 * ambientes gerenciados (`src/scripts/bootstrap-db.ts`). Uma lista só, porque
 * banco de desenvolvimento e banco de produção precisam nascer com o mesmo
 * conjunto — divergência aqui vira 403 inexplicável só em produção.
 */

export const PERMISSION_RESOURCES = [
  'companies',
  'users',
  'roles',
  'permissions',
  'plans',
  'subscriptions',
  'items',
  'stock-movements',
  'receipts',
  'audit-logs',
  // Fase 2 (docs/20, docs/27):
  'finance-settings',
  // docs/18: cadastro do cliente. `customer-credit` (PD-16) é recurso à
  // parte — dar crédito não é a mesma permissão que editar cadastro.
  'customers',
  'customer-credit',
  // docs/19, docs/29: fato de negócio da venda. `sales:delete` significa
  // CANCELAR (venda nunca é excluída, RN-45).
  'sales',
  // docs/22, docs/29: recebimento. `payments:delete` significa ESTORNAR
  // (recebimento nunca é editado nem excluído, RN-74).
  'payments',
] as const;

export const PERMISSION_ACTIONS = ['create', 'read', 'update', 'delete'] as const;

/** Nome do papel de plataforma com acesso total (RN-01). */
export const SUPER_ADMIN_ROLE_NAME = 'Super Admin';
