import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PasswordManagementService } from '../../src/modules/auth/password-management.service';
import type { BusinessException } from '../../src/shared/errors';
import type { PrismaService } from '../../src/shared/prisma';
import type { PasswordService } from '../../src/modules/auth/password.service';
import type { RefreshTokenService } from '../../src/modules/auth/refresh-token.service';
import type { AuditService } from '../../src/modules/audit/audit.service';

const USER = {
  id: 'user-1',
  companyId: 'company-1',
  email: 'dono@empresa.com',
  passwordHash: 'hash-atual',
};

type UserRecord = typeof USER | null;

/** Lê o `data` passado ao prisma.user.update na primeira chamada. */
function updateData(update: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const [args] = update.mock.calls[0] as [{ data: Record<string, unknown> }];
  return args.data;
}

function createDependencies(overrides: { user?: UserRecord; passwordValid?: boolean } = {}) {
  const { user = USER, passwordValid = true } = overrides;

  const update = vi.fn((): Promise<UserRecord> => Promise.resolve(user));
  // `db` é o client da transação da requisição (RLS). Os services acessam
  // sempre por ele, nunca pelo client cru.
  const prisma = {
    db: { user: { findUnique: vi.fn((): Promise<UserRecord> => Promise.resolve(user)), update } },
  } as unknown as PrismaService;

  const passwordService = {
    verifyPassword: vi.fn(() => Promise.resolve(passwordValid)),
    hashPassword: vi.fn(() => Promise.resolve('hash-novo')),
  } as unknown as PasswordService;

  const revokeAllForUser = vi.fn(() => Promise.resolve());
  const refreshTokens = { revokeAllForUser } as unknown as RefreshTokenService;

  const log = vi.fn(() => Promise.resolve());
  const audit = { log } as unknown as AuditService;

  const service = new PasswordManagementService(prisma, passwordService, refreshTokens, audit);

  return { service, update, revokeAllForUser, log, passwordService };
}

describe('PasswordManagementService (RF-04)', () => {
  describe('troca pelo próprio usuário', () => {
    it('exige a senha atual correta', async () => {
      const { service } = createDependencies({ passwordValid: false });

      await expect(
        service.changeOwnPassword('user-1', 'senha-errada', 'senha-nova-segura'),
      ).rejects.toMatchObject({ code: 'SENHA_ATUAL_INCORRETA' });
    });

    it('recusa quando a nova senha é igual à atual', async () => {
      const { service } = createDependencies();

      await expect(
        service.changeOwnPassword('user-1', 'mesma-senha-123', 'mesma-senha-123'),
      ).rejects.toMatchObject({ code: 'SENHA_INVALIDA' });
    });

    it('troca a senha e não marca troca obrigatória', async () => {
      const { service, update } = createDependencies();

      await service.changeOwnPassword('user-1', 'senha-atual', 'senha-nova-segura');

      expect(updateData(update)).toMatchObject({
        passwordHash: 'hash-novo',
        mustChangePassword: false,
      });
    });

    it('revoga todas as sessões após a troca', async () => {
      const { service, revokeAllForUser } = createDependencies();

      await service.changeOwnPassword('user-1', 'senha-atual', 'senha-nova-segura');

      expect(revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('falha com 404 quando o usuário não existe', async () => {
      const { service } = createDependencies({ user: null });

      try {
        await service.changeOwnPassword('sumido', 'x', 'senha-nova-segura');
        expect.unreachable('deveria ter lançado');
      } catch (error) {
        expect((error as BusinessException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  describe('reset por admin', () => {
    it('marca troca obrigatória no próximo acesso', async () => {
      const { service, update } = createDependencies();

      await service.resetPasswordAsAdmin('admin-1', 'company-1', 'user-1', 'senha-temp-segura');

      expect(updateData(update)).toMatchObject({ mustChangePassword: true });
    });

    it('libera bloqueio por tentativas ao resetar', async () => {
      const { service, update } = createDependencies();

      await service.resetPasswordAsAdmin('admin-1', 'company-1', 'user-1', 'senha-temp-segura');

      expect(updateData(update)).toMatchObject({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockoutCount: 0,
      });
    });

    it('não permite resetar usuário de outra empresa', async () => {
      const { service } = createDependencies();

      await expect(
        service.resetPasswordAsAdmin('admin-2', 'outra-company', 'user-1', 'senha-temp-segura'),
      ).rejects.toMatchObject({ code: 'RECURSO_NAO_ENCONTRADO' });
    });

    it('permite super admin (company_id nulo) resetar qualquer usuário', async () => {
      const { service, update } = createDependencies();

      await service.resetPasswordAsAdmin('staff-1', null, 'user-1', 'senha-temp-segura');

      expect(update).toHaveBeenCalled();
    });

    it('registra no audit quem resetou e quem foi afetado', async () => {
      const { service, log } = createDependencies();

      await service.resetPasswordAsAdmin('admin-1', 'company-1', 'user-1', 'senha-temp-segura');

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'password.reset_by_admin',
          userId: 'admin-1',
          diff: { targetUserId: 'user-1' },
        }),
      );
    });

    it('revoga as sessões do usuário resetado', async () => {
      const { service, revokeAllForUser } = createDependencies();

      await service.resetPasswordAsAdmin('admin-1', 'company-1', 'user-1', 'senha-temp-segura');

      expect(revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });
});
