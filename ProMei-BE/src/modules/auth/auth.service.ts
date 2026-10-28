import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Role, User, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import { PasswordService } from './password.service';
import { JwtService } from './jwt.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import type { Env } from '../../shared/config';
import { AuditService } from '../audit/audit.service';
import { RefreshTokenService } from './refresh-token.service';
import { calculateLockedUntil } from './lockout';
import { decideAccess } from '../../shared/access/access-policy';

const AUTH_RESOURCE = 'auth';

type UserWithRoles = User & { roles: (UserRole & { role: Role })[] };

@Injectable()
export class AuthService {
  private readonly maxLoginAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly lockoutMaxDurationMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly refreshTokens: RefreshTokenService,
  ) {
    this.maxLoginAttempts = this.config.get('AUTH_MAX_LOGIN_ATTEMPTS', { infer: true });
    this.lockoutDurationMs = this.config.get('AUTH_LOCKOUT_DURATION_MS', { infer: true });
    this.lockoutMaxDurationMs = this.config.get('AUTH_LOCKOUT_MAX_DURATION_MS', { infer: true });
  }

  async login(
    email: string,
    password: string,
    rememberMe: boolean = false,
    ip?: string,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.db.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      await this.audit.log({
        action: 'login.failed',
        resource: AUTH_RESOURCE,
        diff: { email },
        ip,
      });
      throw new BusinessException(
        BusinessErrorCode.CREDENCIAIS_INVALIDAS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Check if user is locked out
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({
        action: 'login.locked',
        resource: AUTH_RESOURCE,
        userId: user.id,
        companyId: user.companyId,
        ip,
      });
      throw new BusinessException(
        BusinessErrorCode.CONTA_BLOQUEADA,
        'Account temporarily locked due to too many failed login attempts',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Bloqueio expirado: libera o acesso e zera as tentativas, mas preserva
    // lockoutCount — e ele que torna o proximo bloqueio mais longo.
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await this.prisma.db.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    }

    // Verify password
    const passwordValid = await this.passwordService.verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
      // Increment failed attempts and lock if necessary
      const newAttempts = user.failedLoginAttempts + 1;
      const nowLocked = newAttempts >= this.maxLoginAttempts;
      const updateData: Record<string, unknown> = {
        failedLoginAttempts: newAttempts,
      };

      if (nowLocked) {
        // Progressivo: cada bloqueio consecutivo dobra a duracao, ate o teto.
        updateData.lockedUntil = calculateLockedUntil(user.lockoutCount, {
          baseDurationMs: this.lockoutDurationMs,
          maxDurationMs: this.lockoutMaxDurationMs,
        });
        updateData.lockoutCount = user.lockoutCount + 1;
        // failedLoginAttempts permanece com o total que levou ao bloqueio:
        // e informacao util na auditoria. A limpeza acontece quando o bloqueio
        // expira ou apos um login bem-sucedido.
      }

      await this.prisma.db.user.update({
        where: { id: user.id },
        data: updateData,
      });

      await this.audit.log({
        action: 'login.failed',
        resource: AUTH_RESOURCE,
        userId: user.id,
        companyId: user.companyId,
        diff: { attempts: newAttempts, locked: nowLocked, lockoutCount: user.lockoutCount },
        ip,
      });

      throw new BusinessException(
        BusinessErrorCode.CREDENCIAIS_INVALIDAS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Tabela de decisao de acesso (docs/04): empresa suspensa ou cancelada nao
    // loga, mesmo com a senha correta. Verificado APOS a senha para nao revelar
    // o estado da empresa a quem nao provou ser dono da conta.
    await this.ensureCompanyAllowsLogin(user.companyId, ip, user.id);

    // Login valido zera tentativas E reincidencia: o historico so pune quem
    // encadeia bloqueios sem nunca acertar a senha.
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lockoutCount: 0 },
    });

    await this.audit.log({
      action: 'login.success',
      resource: AUTH_RESOURCE,
      userId: user.id,
      companyId: user.companyId,
      ip,
    });

    const permissions = await this.getUserPermissions(user.id);
    const { accessToken, refreshToken } = this.issueTokenPair(user, permissions);
    await this.refreshTokens.issueInitial(user.id, refreshToken, rememberMe);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.jwtService.getAccessTokenExpiry(),
    };
  }

  /**
   * RF-02: rotação a cada uso. O refresh apresentado é sempre marcado como usado;
   * se ele já estava marcado (reuso de um token velho), a família inteira é
   * revogada e a sessão é invalidada — mesmo o token mais recente da família
   * deixa de funcionar.
   */
  async refresh(presentedToken: string, ip?: string): Promise<AuthResponseDto> {
    const result = await this.refreshTokens.consume(presentedToken);

    if (result.status === 'reused') {
      await this.refreshTokens.revokeFamily(result.familyId);
      await this.audit.log({
        action: 'refresh.reuse_detected',
        resource: AUTH_RESOURCE,
        diff: { familyId: result.familyId },
        ip,
      });
      throw new BusinessException(
        BusinessErrorCode.SESSAO_INVALIDADA,
        'Refresh token reused; session invalidated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (result.status === 'not_found' || result.status === 'expired') {
      await this.audit.log({
        action: 'refresh.failed',
        resource: AUTH_RESOURCE,
        diff: { reason: result.status },
        ip,
      });
      throw new BusinessException(
        BusinessErrorCode.REFRESH_INVALIDO,
        'Invalid or expired refresh token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.prisma.db.user.findUnique({
      where: { id: result.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      throw new BusinessException(
        BusinessErrorCode.REFRESH_INVALIDO,
        'Invalid or expired refresh token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const permissions = await this.getUserPermissions(user.id);
    const { accessToken, refreshToken } = this.issueTokenPair(user, permissions);
    await this.refreshTokens.issueRotated(
      user.id,
      result.familyId,
      refreshToken,
      result.rememberMe,
    );

    await this.audit.log({
      action: 'refresh.success',
      resource: AUTH_RESOURCE,
      userId: user.id,
      companyId: user.companyId,
      ip,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.jwtService.getAccessTokenExpiry(),
    };
  }

  /** Logout revoga a família inteira — idempotente, mesmo com token desconhecido/já usado. */
  async logout(presentedToken: string, ip?: string): Promise<void> {
    const familyId = await this.refreshTokens.findFamilyIdByToken(presentedToken);

    if (familyId) {
      await this.refreshTokens.revokeFamily(familyId);
    }

    await this.audit.log({
      action: 'logout',
      resource: AUTH_RESOURCE,
      diff: { familyId },
      ip,
    });
  }

  /** RN-13: empresa suspensa ou cancelada bloqueia o login por completo. */
  private async ensureCompanyAllowsLogin(
    companyId: string | null,
    ip?: string,
    userId?: string,
  ): Promise<void> {
    if (!companyId) return; // Super Admin/Staff nao pertence a company (RN-05).

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true, subscription: { select: { status: true } } },
    });

    if (!company) return;

    const decision = decideAccess(company.status, company.subscription?.status);

    if (!decision.canLogin) {
      await this.audit.log({
        action: 'login.blocked',
        resource: AUTH_RESOURCE,
        userId,
        companyId,
        diff: { reason: decision.reason },
        ip,
      });

      throw new BusinessException(
        BusinessErrorCode.EMPRESA_SEM_ACESSO,
        'Acesso bloqueado: company suspensa ou cancelada',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private issueTokenPair(
    user: UserWithRoles,
    permissions: string[] = [],
  ): { accessToken: string; refreshToken: string } {
    const roleNames = user.roles.map((ur) => ur.role.name);

    const accessToken = this.jwtService.generateAccessToken({
      sub: user.id,
      company_id: user.companyId,
      roles: roleNames,
      permissions,
      // RF-04: enquanto marcado, o guard restringe o usuario a trocar a senha.
      must_change_password: user.mustChangePassword,
    });

    const refreshToken = this.jwtService.generateRefreshToken({
      sub: user.id,
      company_id: user.companyId,
      roles: roleNames,
      permissions,
    });

    return { accessToken, refreshToken };
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    // Buscar roles do usuário e suas permissões associadas
    const userRoles = await this.prisma.db.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: {
              select: {
                permission: {
                  select: {
                    resource: true,
                    action: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Extrair permissões únicas (pode haver duplicatas se múltiplas roles compartilham a mesma permissão)
    const permissionSet = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePerm of userRole.role.permissions) {
        const permission = rolePerm.permission;
        permissionSet.add(`${permission.resource}:${permission.action}`);
      }
    }

    return Array.from(permissionSet);
  }
}
