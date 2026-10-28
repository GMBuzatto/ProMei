/**
 * Papéis padrão de toda empresa nova (RF-11) e as permissões de cada um.
 *
 * Isto vivia só em `prisma/seed.ts`. Enquanto empresa só nascia por seed, tudo
 * bem; a partir do provisionamento via API o mesmo conjunto precisa valer nos
 * dois caminhos, senão empresa criada em produção e empresa criada em
 * desenvolvimento passam a ter permissões diferentes — e o bug só apareceria
 * em produção, que é onde ninguém quer descobrir.
 *
 * O seed importa daqui. Mudou aqui, mudou nos dois.
 */

export const ADMIN_ROLE_NAME = 'Admin';
export const COLLABORATOR_ROLE_NAME = 'Colaborador';

/**
 * O Admin recebe **todas** as ações dos recursos que administra dentro da
 * própria empresa. Recursos de plataforma (`companies`, `plans`,
 * `subscriptions`) ficam de fora de propósito: quem administra o negócio não
 * administra a plataforma (RN-01/RN-05).
 *
 * `audit-logs` entra só como leitura — a trilha é append-only (RNF-06) e não
 * existe ação de escrita para conceder.
 */
export const ADMIN_FULL_RESOURCES = [
  'users',
  'roles',
  'items',
  'stock-movements',
  'receipts',
  // Fase 2 (docs/20): configuração financeira da própria empresa.
  'finance-settings',
  // docs/18: cadastro de clientes. `customer-credit` é recurso separado de
  // propósito (PD-16): "corrigir o telefone" e "dar R$ 5.000 de crédito" não
  // podem viver sob a mesma permissão.
  'customers',
  'customer-credit',
  // docs/29: Admin cria, lê, atualiza e CANCELA (`sales:delete`) venda.
  'sales',
  // docs/29: Admin registra e ESTORNA (`payments:delete`) recebimento.
  'payments',
] as const;

export const ADMIN_READ_ONLY_RESOURCES = ['audit-logs'] as const;

/**
 * O Colaborador opera o dia a dia do estoque e não enxerga usuários nem papéis.
 * Movimentação ele cria; item ele só lê — cadastrar item é decisão de quem
 * responde pelo catálogo.
 */
export const COLLABORATOR_PERMISSIONS = [
  { resource: 'items', actions: ['read'] },
  { resource: 'stock-movements', actions: ['create', 'read'] },
  { resource: 'receipts', actions: ['read'] },
  // docs/29: Colaborador "vende mas não perdoa" — registra venda, não cancela.
  { resource: 'sales', actions: ['create', 'read'] },
  // docs/29: registra recebimento, não estorna (`payments:delete` fica de fora).
  { resource: 'payments', actions: ['create', 'read'] },
] as const;

export interface ResourceAction {
  resource: string;
  action: string;
}

/** Pares `recurso:ação` que o papel Admin recebe. */
export function adminPermissionMatcher(): {
  fullResources: string[];
  readOnlyResources: string[];
} {
  return {
    fullResources: [...ADMIN_FULL_RESOURCES],
    readOnlyResources: [...ADMIN_READ_ONLY_RESOURCES],
  };
}

/** Pares `recurso:ação` que o papel Colaborador recebe. */
export function collaboratorPermissionPairs(): ResourceAction[] {
  return COLLABORATOR_PERMISSIONS.flatMap(({ resource, actions }) =>
    actions.map((action) => ({ resource, action })),
  );
}
