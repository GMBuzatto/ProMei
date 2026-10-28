import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';

const AUTH_RESOURCE = 'auth';

/**
 * RF-04 — troca de senha pelo próprio usuário e reset por admin.
 *
 * Em ambos os fluxos todas as sessões do usuário são revogadas: senha trocada
 * significa que os refresh tokens antigos não valem mais (docs/09).
 */
@Injectable()
export class PasswordManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  /** Troca feita pelo próprio usuário: exige a senha atual. */
  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip?: string,
  ): Promise<void> {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new BusinessException(
        BusinessErrorCode.USUARIO_NAO_ENCONTRADO,
        'User not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const currentPasswordValid = await this.passwordService.verifyPassword(
      user.passwordHash,
      currentPassword,
    );

    if (!currentPasswordValid) {
      await this.audit.log({
        action: 'password.change_failed',
        resource: AUTH_RESOURCE,
        userId: user.id,
        companyId: user.companyId,
        diff: { reason: 'invalid_current_password' },
        ip,
      });

      throw new BusinessException(
        BusinessErrorCode.SENHA_ATUAL_INCORRETA,
        'Current password is incorrect',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (currentPassword === newPassword) {
      throw new BusinessException(
        BusinessErrorCode.SENHA_INVALIDA,
        'New password must be different from the current one',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    await this.applyNewPassword(user.id, newPassword, { mustChangePassword: false });

    await this.audit.log({
      action: 'password.changed',
      resource: AUTH_RESOURCE,
      userId: user.id,
      companyId: user.companyId,
      ip,
    });
  }

  /**
   * Reset por admin: o admin define a senha e a repassa ao usuário por fora
   * (não há e-mail no MVP). A conta fica com troca obrigatória no próximo acesso,
   * e qualquer bloqueio por tentativas é liberado.
   */
  async resetPasswordAsAdmin(
    adminId: string | undefined,
    adminCompanyId: string | null | undefined,
    targetUserId: string,
    newPassword: string,
    ip?: string,
  ): Promise<void> {
    const target = await this.prisma.db.user.findUnique({ where: { id: targetUserId } });

    if (!target) {
      throw new BusinessException(
        BusinessErrorCode.USUARIO_NAO_ENCONTRADO,
        'User not found',
        HttpStatus.NOT_FOUND,
      );
    }

    // Escopo de tenant: admin de empresa só reseta gente da própria empresa.
    // Super Admin/staff tem company_id nulo e não sofre a restrição.
    if (adminCompanyId && target.companyId !== adminCompanyId) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'User not found',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.applyNewPassword(target.id, newPassword, { mustChangePassword: true });

    await this.audit.log({
      action: 'password.reset_by_admin',
      resource: AUTH_RESOURCE,
      userId: adminId,
      companyId: target.companyId,
      diff: { targetUserId: target.id },
      ip,
    });
  }

  /** Grava o hash, ajusta as flags e derruba todas as sessões do usuário. */
  private async applyNewPassword(
    userId: string,
    newPassword: string,
    { mustChangePassword }: { mustChangePassword: boolean },
  ): Promise<void> {
    const passwordHash = await this.passwordService.hashPassword(newPassword);

    await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockoutCount: 0,
      },
    });

    await this.refreshTokens.revokeAllForUser(userId);
  }
}
