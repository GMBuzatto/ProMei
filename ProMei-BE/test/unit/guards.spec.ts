import { HttpStatus } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { PasswordChangeRequiredGuard } from '../../src/shared/guards/password-change-required.guard';
import type { JwtService } from '../../src/modules/auth/jwt.service';
import type { AuthenticatedUser } from '../../src/shared/logging';
import type { BusinessException } from '../../src/shared/errors';

interface RequestFake {
  headers: Record<string, string | undefined>;
  user?: AuthenticatedUser;
}

function createContext(request: RequestFake): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function createReflector(value: unknown): Reflector {
  return { getAllAndOverride: vi.fn(() => value) } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  const payload = {
    sub: 'user-1',
    company_id: 'company-1',
    roles: ['ADMIN'],
    must_change_password: false,
    type: 'access' as const,
  };
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = { verifyAccessToken: vi.fn(() => payload) } as unknown as JwtService;
  });

  it('libera rota marcada como @Public sem exigir token', () => {
    const guard = new JwtAuthGuard(createReflector(true), jwtService);

    expect(guard.canActivate(createContext({ headers: {} }))).toBe(true);
  });

  it('protege por padrão: sem token, 401', () => {
    const guard = new JwtAuthGuard(createReflector(false), jwtService);

    try {
      guard.canActivate(createContext({ headers: {} }));
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      const exception = error as BusinessException;
      expect(exception.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(exception.code).toBe('NAO_AUTENTICADO');
    }
  });

  it('recusa header sem o esquema Bearer', () => {
    const guard = new JwtAuthGuard(createReflector(false), jwtService);

    expect(() =>
      guard.canActivate(createContext({ headers: { authorization: 'Basic abc' } })),
    ).toThrow();
  });

  it('popula request.user a partir do token', () => {
    const guard = new JwtAuthGuard(createReflector(false), jwtService);
    const request: RequestFake = { headers: { authorization: 'Bearer token-valido' } };

    expect(guard.canActivate(createContext(request))).toBe(true);
    expect(request.user).toEqual({
      sub: 'user-1',
      company_id: 'company-1',
      roles: ['ADMIN'],
      must_change_password: false,
    });
  });

  it('recusa token inválido com 401', () => {
    const invalidJwt = {
      verifyAccessToken: vi.fn(() => {
        throw new Error('Invalid or expired access token');
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(createReflector(false), invalidJwt);

    expect(() =>
      guard.canActivate(createContext({ headers: { authorization: 'Bearer expirado' } })),
    ).toThrow();
  });
});

describe('PasswordChangeRequiredGuard', () => {
  it('bloqueia quando a troca de senha está pendente', () => {
    const guard = new PasswordChangeRequiredGuard(createReflector(false));
    const request: RequestFake = { headers: {}, user: { sub: 'u1', must_change_password: true } };

    try {
      guard.canActivate(createContext(request));
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      const exception = error as BusinessException;
      expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(exception.code).toBe('TROCA_DE_SENHA_OBRIGATORIA');
    }
  });

  it('libera a própria rota de troca de senha', () => {
    const guard = new PasswordChangeRequiredGuard(createReflector(true));
    const request: RequestFake = { headers: {}, user: { sub: 'u1', must_change_password: true } };

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it('passa quando não há troca pendente', () => {
    const guard = new PasswordChangeRequiredGuard(createReflector(false));
    const request: RequestFake = { headers: {}, user: { sub: 'u1', must_change_password: false } };

    expect(guard.canActivate(createContext(request))).toBe(true);
  });
});
