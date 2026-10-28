/**
 * A matriz recurso × ação (RF-12), sem React e sem rede.
 *
 * As linhas e as colunas saem do catálogo que a API devolve em `GET /permissions` — nunca de
 * uma lista fixa aqui (docs/16-configuracao-sem-hardcode.md). Se a API ganhar um recurso novo
 * amanhã, ele aparece na tela sem release do front; o que existe abaixo é só **rótulo** e
 * **ordem**, com queda para a chave crua quando o par é desconhecido.
 */

/** Uma permissão como a API a nomeia: `recurso:ação`. */
export type Permission = string;

export type MatrixRow = {
  resource: string;
  label: string;
  /** Só as ações que existem para este recurso — célula vazia não vira checkbox. */
  actions: string[];
};

export type PermissionMatrix = {
  /** Colunas, na ordem canônica do CRUD. */
  actions: string[];
  rows: MatrixRow[];
};

/**
 * Ordem das colunas. Ler vem antes de escrever porque é assim que a permissão costuma ser
 * concedida — e porque "read" é pré-requisito prático das outras na leitura da tela.
 */
const ACTION_ORDER = ["read", "create", "update", "delete"];

const ACTION_LABELS: Record<string, string> = {
  read: "Ver",
  create: "Criar",
  update: "Editar",
  delete: "Excluir",
};

const RESOURCE_LABELS: Record<string, string> = {
  items: "Itens",
  "stock-movements": "Movimentações de estoque",
  receipts: "Comprovantes",
  users: "Usuários",
  roles: "Papéis",
  permissions: "Permissões",
  "audit-logs": "Registros de auditoria",
  companies: "Empresas",
  plans: "Planos",
  subscriptions: "Assinaturas",
};

/**
 * Recursos que só existem do lado da plataforma (`@PlatformRoute` no `PermissionsGuard`) e
 * **não entram na matriz**.
 *
 * O catálogo de `GET /permissions` é global — serve plataforma e empresas —, mas esta tela
 * monta papéis de empresa. Marcar `companies:read` num papel desses não daria acesso a nada:
 * a API responde 404 nessas rotas para usuário de empresa (RN-05), e o próprio back-end
 * exclui esses recursos dos papéis padrão da empresa (`ADMIN_FULL_RESOURCES`, RN-01). Oferecer
 * a caixa seria oferecer uma concessão que não concede.
 */
const PLATFORM_RESOURCES = new Set(["companies", "plans", "subscriptions"]);

export function isPlatformResource(resource: string): boolean {
  return PLATFORM_RESOURCES.has(resource);
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource;
}

/**
 * Monta a matriz a partir do catálogo `["items:create", ...]`.
 *
 * Recursos de plataforma e entrada malformada ficam de fora — as colunas também saem só do
 * que sobrou, então uma ação que existisse apenas em recurso de plataforma não viraria uma
 * coluna inteira de traços.
 */
export function buildPermissionMatrix(catalog: Permission[]): PermissionMatrix {
  const byResource = new Map<string, Set<string>>();
  const actions = new Set<string>();

  for (const permission of catalog) {
    const [resource, action] = permission.split(":");
    if (!resource || !action) continue;
    if (isPlatformResource(resource)) continue;

    actions.add(action);
    const current = byResource.get(resource) ?? new Set<string>();
    current.add(action);
    byResource.set(resource, current);
  }

  const orderedActions = [...actions].sort(compareActions);

  const rows = [...byResource.entries()]
    .map(([resource, resourceActions]) => ({
      resource,
      label: resourceLabel(resource),
      actions: [...resourceActions].sort(compareActions),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return { actions: orderedActions, rows };
}

/** Ações conhecidas na ordem do CRUD; as demais vão para o fim, em ordem alfabética. */
function compareActions(a: string, b: string): number {
  const indexA = ACTION_ORDER.indexOf(a);
  const indexB = ACTION_ORDER.indexOf(b);

  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;

  return a.localeCompare(b);
}

export function permissionKey(resource: string, action: string): Permission {
  return `${resource}:${action}`;
}

/** Marca/desmarca uma célula. Devolve um conjunto novo — o estado do form é imutável. */
export function togglePermission(
  selected: Set<Permission>,
  permission: Permission,
): Set<Permission> {
  const next = new Set(selected);

  if (next.has(permission)) next.delete(permission);
  else next.add(permission);

  return next;
}

export type GroupState = "all" | "some" | "none";

/** Estado de uma linha (ou coluna) inteira, para o checkbox de "marcar tudo". */
export function groupState(selected: Set<Permission>, permissions: Permission[]): GroupState {
  if (permissions.length === 0) return "none";

  const marked = permissions.filter((permission) => selected.has(permission)).length;

  if (marked === 0) return "none";
  return marked === permissions.length ? "all" : "some";
}

/**
 * Marca ou desmarca um conjunto de uma vez (linha do recurso, coluna da ação).
 *
 * Parcialmente marcado vira **tudo marcado**: o clique num grupo incompleto quase sempre quer
 * completar, não zerar o que já estava lá.
 */
export function toggleGroup(selected: Set<Permission>, permissions: Permission[]): Set<Permission> {
  const next = new Set(selected);
  const state = groupState(selected, permissions);

  for (const permission of permissions) {
    if (state === "all") next.delete(permission);
    else next.add(permission);
  }

  return next;
}

/** Permissões de uma coluna, considerando só os recursos que têm aquela ação. */
export function columnPermissions(matrix: PermissionMatrix, action: string): Permission[] {
  return matrix.rows
    .filter((row) => row.actions.includes(action))
    .map((row) => permissionKey(row.resource, action));
}

export function rowPermissions(row: MatrixRow): Permission[] {
  return row.actions.map((action) => permissionKey(row.resource, action));
}

/** Todas as permissões da matriz — usado pelo "marcar tudo" e pela contagem do rodapé. */
export function allPermissions(matrix: PermissionMatrix): Permission[] {
  return matrix.rows.flatMap(rowPermissions);
}

/**
 * Permissões selecionadas que **não estão** no catálogo.
 *
 * Acontece quando um papel guarda uma permissão que a API deixou de oferecer. Enviá-la de
 * volta faria o `PATCH` inteiro falhar com `PERMISSAO_INEXISTENTE`, então a tela precisa saber
 * que elas existem para avisar em vez de deixar o salvamento morrer sem explicação.
 */
export function unknownPermissions(
  selected: Iterable<Permission>,
  catalog: Permission[],
): Permission[] {
  const known = new Set(catalog);
  return [...selected].filter((permission) => !known.has(permission));
}
