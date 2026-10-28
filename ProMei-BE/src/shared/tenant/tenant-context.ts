import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de tenant da requisição em curso.
 *
 * `companyId` nulo com `isPlatformUser` verdadeiro identifica Super Admin/Staff
 * (RN-05: usuário de plataforma não pertence a empresa nenhuma).
 */
export interface TenantContext {
  companyId?: string | null;
  userId?: string;
  roles?: string[];
  isPlatformUser?: boolean;
  /**
   * Transação da requisição. É nela que o contexto de tenant está publicado na
   * sessão do Postgres, então TODA query precisa sair por aqui para o RLS
   * enxergar o tenant. Ver `PrismaService.db`.
   */
  tx?: unknown;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Abre um contexto para a requisição. O objeto é criado vazio no início do
 * request (hook do Fastify) e preenchido depois pelo JwtAuthGuard — por isso é
 * mutável: guards do Nest rodam depois dos hooks do Fastify, e não teriam como
 * abrir um novo escopo que valesse para o resto da cadeia.
 */
export function runWithTenantContext<T>(context: TenantContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/** Preenche o contexto já aberto. Chamado pelo JwtAuthGuard após validar o token. */
export function setTenantContext(patch: TenantContext): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, patch);
}

/**
 * Empresa que deve escopar as queries.
 *
 * Retorna `undefined` quando não há escopo a aplicar — seja porque não existe
 * contexto (seed, migrações, login antes da autenticação) ou porque o usuário é
 * de plataforma. Nesses casos a Client Extension não filtra.
 */
/** Transação em curso, quando a requisição já abriu uma. */
export function getTenantTransaction(): unknown {
  return storage.getStore()?.tx;
}

export function getScopedCompanyId(): string | undefined {
  const context = storage.getStore();
  if (!context) return undefined;
  if (context.isPlatformUser) return undefined;
  return context.companyId ?? undefined;
}
