import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ANY_AUTHENTICATED_KEY,
  PERMISSIONS_KEY,
  PLATFORM_ROUTE_KEY,
} from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { BusinessErrorCode, BusinessException } from '../errors';
import type { AuthenticatedUser } from '../logging';
import { PermissionsService, SUPER_ADMIN_ROLE } from '../../modules/permissions';

/**
 * Guard global de autorização (RF-13).
 *
 * Duas responsabilidades:
 *
 * 1. **Permissão** `recurso:ação` declarada com `@RequirePermission`. Sem a
 *    permissão, 403 com código de negócio `PERMISSAO_NEGADA`.
 * 2. **Fronteira plataforma/tenant**. Rota marcada com `@PlatformRoute` exige
 *    usuário sem `company_id` (Super Admin/Staff, RN-05) — é o único lugar onde
 *    eles operam cross-tenant. Rota não marcada exige usuário de empresa.
 *
 * Super Admin tem acesso total na plataforma (RN-01) e dispensa a checagem de
 * permissão; Staff passa pelo mesmo fluxo de permissões que os demais.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new BusinessException(
        BusinessErrorCode.NAO_AUTENTICADO,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isAnyAuthenticated =
      this.reflector.getAllAndOverride<boolean>(ANY_AUTHENTICATED_KEY, targets) ?? false;
    const isPlatformRoute =
      this.reflector.getAllAndOverride<boolean>(PLATFORM_ROUTE_KEY, targets) ?? false;
    const isPlatformUser = !user.company_id;

    if (!isAnyAuthenticated) {
      this.checkBoundary(isPlatformRoute, isPlatformUser);
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);

    if (!required || required.length === 0) {
      return true;
    }

    const roles = user.roles ?? [];

    if (roles.includes(SUPER_ADMIN_ROLE)) {
      return true;
    }

    const granted = await this.permissionsService.getPermissionsForRoles(roles, user.company_id);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      throw new BusinessException(
        BusinessErrorCode.PERMISSAO_NEGADA,
        `Missing permission: ${missing.join(', ')}`,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }

  /**
   * Usuário de plataforma em rota de tenant, ou usuário de empresa em rota de
   * plataforma: 404, não 403. Revelar que a rota existe já é informação.
   */
  private checkBoundary(isPlatformRoute: boolean, isPlatformUser: boolean): void {
    if (isPlatformRoute && !isPlatformUser) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Resource not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!isPlatformRoute && isPlatformUser) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Resource not found',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
