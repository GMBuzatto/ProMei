import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { BusinessErrorCode, BusinessException } from '../errors';
import type { AuthenticatedUser } from '../logging';

/** Rotas liberadas mesmo com troca de senha pendente. */
export const ALLOW_PASSWORD_CHANGE_PENDING = 'allowPasswordChangePending';

/**
 * RF-04: senha definida por admin obriga troca no primeiro acesso.
 *
 * Enquanto `must_change_password` estiver marcado no token, o usuário fica
 * restrito à própria troca de senha — não adianta ter credencial válida se ela
 * foi definida por outra pessoa.
 */
@Injectable()
export class PasswordChangeRequiredGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_PENDING, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowed || isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    if (request.user?.must_change_password) {
      throw new BusinessException(
        BusinessErrorCode.TROCA_DE_SENHA_OBRIGATORIA,
        'Password change required before using the API',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
