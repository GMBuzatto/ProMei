import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const PLATFORM_ROUTE_KEY = 'isPlatformRoute';
export const ANY_AUTHENTICATED_KEY = 'isAnyAuthenticatedRoute';

/**
 * Exige permissões no formato `recurso:ação` (RF-12/RF-13).
 * Múltiplas permissões são exigidas em conjunto (AND).
 *
 * Ex.: `@RequirePermission('items:create')`
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Marca a rota como **de plataforma**: só Super Admin/Staff (sem `company_id`)
 * podem acessar, e é o único lugar onde eles operam cross-tenant.
 *
 * O padrão de uma rota NÃO marcada é ser de tenant — exige usuário vinculado a
 * uma empresa. O default é o lado seguro: esquecer o decorator fecha a rota para
 * usuário de plataforma (que não sofre escopo automático), em vez de abrir.
 */
export const PlatformRoute = () => SetMetadata(PLATFORM_ROUTE_KEY, true);

/**
 * Rota que qualquer usuário autenticado acessa, seja de empresa ou de plataforma
 * (ex.: trocar a própria senha).
 *
 * Use com parcimônia: aqui a fronteira plataforma/tenant não é verificada, então
 * a rota precisa operar apenas sobre dados do próprio usuário (`user.sub`) ou
 * aplicar o escopo por conta própria.
 */
export const AnyAuthenticated = () => SetMetadata(ANY_AUTHENTICATED_KEY, true);
