import { getScopedCompanyId } from './tenant-context';

/**
 * Models que possuem `company_id` e portanto precisam de escopo de tenant
 * (ADR-0003). A lista é **explícita de propósito**: um model novo não entra no
 * escopo por acidente nem fica de fora silenciosamente — quem adicionar uma
 * tabela de negócio tem que decidir aqui, e o teste de isolamento cobra.
 */
export const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Role',
  'Item',
  'StockMovement',
  'Receipt',
  'Subscription',
  'AuditLog',
  'Company',
  // Fase 2 (docs/18, docs/27):
  'Customer',
  'CustomerStatusEvent',
  'Sale',
  'SaleItem',
  'Payment',
]);

/**
 * Models globais da plataforma, sem `company_id`. Nunca recebem filtro.
 * Documentados aqui para deixar claro que a ausência é intencional.
 */
export const GLOBAL_MODELS = new Set(['Permission', 'Plan', 'RolePermission', 'UserRole']);

/** `Company` é escopada por `id`, não por `company_id`. */
const SCOPE_FIELD_BY_MODEL: Record<string, string> = { Company: 'id' };

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * `update` e `delete` no singular recebem `WhereUniqueInput`: exigem um campo
 * único no topo e NÃO aceitam `AND` ali. Nesses o escopo entra por spread.
 */
const WRITE_UNIQUE_WHERE = new Set(['update', 'delete']);

/** Estes aceitam `WhereInput` completo, então podem receber o `AND`. */
const WRITE_WITH_WHERE = new Set(['updateMany', 'deleteMany']);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

interface OperationArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  [key: string]: unknown;
}

function scopeField(model: string): string {
  return SCOPE_FIELD_BY_MODEL[model] ?? 'companyId';
}

/**
 * Operações em que `companyId` NÃO pode entrar no `where`.
 *
 * `findUnique` aceita apenas campos únicos, e `companyId` não é único — o Prisma
 * rejeitaria a query. Para essas, o escopo é aplicado no resultado (ver
 * `matchesTenant`), não no filtro.
 */
const UNIQUE_ONLY_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow']);

/** Descarta registro que pertence a outra empresa. */
export function matchesTenant(model: string, record: unknown, companyId: string): boolean {
  if (!record || typeof record !== 'object') return true;
  const value = (record as Record<string, unknown>)[scopeField(model)];
  return value === companyId;
}

export function isUniqueOnlyOperation(operation: string): boolean {
  return UNIQUE_ONLY_OPERATIONS.has(operation);
}

/**
 * Injeta o escopo de tenant em `args`.
 *
 * O filtro entra como `AND` em vez de sobrescrever o `where`. A diferença
 * importa: pedir explicitamente dados de outra empresa passa a devolver
 * **vazio**, em vez de devolver silenciosamente os da própria empresa. As duas
 * formas são seguras, mas sobrescrever mascara bug de aplicação — o chamador
 * acha que a consulta funcionou.
 */
export function applyTenantScope(
  model: string,
  operation: string,
  args: OperationArgs,
  companyId: string,
): { args: OperationArgs; operation: string } {
  const field = scopeField(model);

  if (WRITE_UNIQUE_WHERE.has(operation)) {
    return {
      args: { ...args, where: { ...(args.where ?? {}), [field]: companyId } },
      operation,
    };
  }

  if (
    (READ_OPERATIONS.has(operation) || WRITE_WITH_WHERE.has(operation)) &&
    !UNIQUE_ONLY_OPERATIONS.has(operation)
  ) {
    const originalWhere = args.where ?? {};
    const scope = { [field]: companyId };

    const scoped: OperationArgs = {
      ...args,
      where: Object.keys(originalWhere).length === 0 ? scope : { AND: [originalWhere, scope] },
    };

    return { args: scoped, operation };
  }

  /**
   * `upsert` recebe escopo apenas no `create`: o `where` dele exige campo único,
   * e `company_id` não é único. Para não deixar brecha, o `where` do upsert deve
   * usar a chave composta que já inclui a empresa (ex.: `companyId_sku`, que o
   * schema define como `@@unique([companyId, sku])`).
   */
  if (operation === 'upsert') {
    const create = args.create;
    if (create && typeof create === 'object') {
      return {
        args: { ...args, create: { ...(create as Record<string, unknown>), [field]: companyId } },
        operation,
      };
    }
    return { args, operation };
  }

  if (CREATE_OPERATIONS.has(operation)) {
    const data = args.data;

    if (Array.isArray(data)) {
      return {
        args: { ...args, data: data.map((item) => ({ ...item, [field]: companyId })) },
        operation,
      };
    }

    if (data && typeof data === 'object') {
      return { args: { ...args, data: { ...data, [field]: companyId } }, operation };
    }
  }

  return { args, operation };
}

export function shouldScope(model: string | undefined): model is string {
  return typeof model === 'string' && TENANT_SCOPED_MODELS.has(model);
}

/**
 * Client Extension que aplica o escopo de tenant automaticamente (docs/06).
 *
 * Substitui o antigo `$use` (client middleware), removido no Prisma 7.
 */
export function tenantExtension() {
  return {
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args?: OperationArgs;
          query: (args?: OperationArgs) => Promise<unknown>;
        }): Promise<unknown> {
          const companyId = getScopedCompanyId();

          if (!companyId || !shouldScope(model)) {
            return query(args);
          }

          // findUnique/findUniqueOrThrow: filtra o resultado, nao o `where`.
          if (isUniqueOnlyOperation(operation)) {
            const result = await query(args);
            return matchesTenant(model, result, companyId) ? result : null;
          }

          const scoped = applyTenantScope(model, operation, args ?? {}, companyId);

          return query(scoped.args);
        },
      },
    },
  };
}
