import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { JwtService } from '../../modules/auth/jwt.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { BusinessErrorCode, BusinessException } from '../errors';
import type { AuthenticatedUser } from '../logging';
import { setTenantContext } from '../tenant/tenant-context';

/**
 * Valida o access token e popula `request.user`.
 *
 * Registrado globalmente: toda rota exige autenticação por padrão, e a exceção
 * é explícita via `@Public()`. O caminho seguro é o default — esquecer o
 * decorator deixa a rota protegida, não aberta.
 *
 * Popular `request.user` também alimenta `company_id`/`user_id` nos logs
 * estruturados (docs/13).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const token = this.extractToken(request.headers.authorization);

    if (!token) {
      throw new BusinessException(
        BusinessErrorCode.NAO_AUTENTICADO,
        'Authentication token is missing',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = this.jwtService.verifyAccessToken(token);
      request.user = {
        sub: payload.sub,
        company_id: payload.company_id,
        roles: payload.roles,
        must_change_password: payload.must_change_password,
      };

      // Alimenta o contexto que a Client Extension usa para escopar as queries.
      // RN-05: usuario sem company_id e de plataforma (Super Admin/Staff).
      setTenantContext({
        userId: payload.sub,
        companyId: payload.company_id,
        roles: payload.roles,
        isPlatformUser: !payload.company_id,
      });
    } catch {
      throw new BusinessException(
        BusinessErrorCode.NAO_AUTENTICADO,
        'Invalid or expired access token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }

  private extractToken(authorization?: string): string | undefined {
    if (!authorization) return undefined;
    const [scheme, value] = authorization.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}
