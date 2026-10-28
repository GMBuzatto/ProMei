import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../logging';

/** Injeta o usuário autenticado que o JwtAuthGuard colocou no request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
