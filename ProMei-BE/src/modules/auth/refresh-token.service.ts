import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { Env } from '../../shared/config';

export type RefreshLookupResult =
  | { status: 'not_found' }
  | { status: 'reused'; familyId: string }
  | { status: 'expired'; familyId: string }
  | { status: 'valid'; userId: string; familyId: string; rememberMe: boolean };

/**
 * Persistência do RF-02: refresh token com hash no banco, rotação a cada uso e
 * revogação (logout + detecção de reuso). O token em si (JWT assinado pelo
 * JwtService) nunca é armazenado em texto puro — só o hash SHA-256.
 */
@Injectable()
export class RefreshTokenService {
  /** Mesma fonte que o JwtService usa para assinar o refresh token (JWT_REFRESH_TTL). */
  private readonly refreshTokenTtlMs: number;
  private readonly refreshTokenRememberMeTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.refreshTokenTtlMs = this.config.get('JWT_REFRESH_TTL', { infer: true }) * 1000;
    this.refreshTokenRememberMeTtlMs =
      this.config.get('JWT_REFRESH_TTL_REMEMBER_ME', { infer: true }) * 1000;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Primeiro refresh token de uma sessão de login — cria uma nova família. */
  async issueInitial(userId: string, token: string, rememberMe: boolean = false): Promise<string> {
    const familyId = randomUUID();
    await this.persist(userId, familyId, token, rememberMe);
    return familyId;
  }

  /** Novo refresh token gerado na rotação — permanece na mesma família. */
  async issueRotated(
    userId: string,
    familyId: string,
    token: string,
    rememberMe: boolean = false,
  ): Promise<void> {
    await this.persist(userId, familyId, token, rememberMe);
  }

  private async persist(
    userId: string,
    familyId: string,
    token: string,
    rememberMe: boolean = false,
  ): Promise<void> {
    const ttlMs = rememberMe ? this.refreshTokenRememberMeTtlMs : this.refreshTokenTtlMs;
    await this.prisma.db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.hash(token),
        rememberMe,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
  }

  /**
   * Consulta o token presente e já marca o resultado esperado:
   * - válido: marca como usado (revokedAt) para forçar rotação — quem chama emite o próximo;
   * - reusado (já estava revoked): não mexe em nada aqui, quem chama deve invalidar a família;
   * - expirado: marca revoked para limpeza.
   */
  async consume(token: string): Promise<RefreshLookupResult> {
    const hash = this.hash(token);
    const record = await this.prisma.db.refreshToken.findUnique({ where: { tokenHash: hash } });

    if (!record) {
      return { status: 'not_found' };
    }

    if (record.revokedAt) {
      return { status: 'reused', familyId: record.familyId };
    }

    if (record.expiresAt <= new Date()) {
      await this.prisma.db.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      return { status: 'expired', familyId: record.familyId };
    }

    await this.prisma.db.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return {
      status: 'valid',
      userId: record.userId,
      familyId: record.familyId,
      rememberMe: record.rememberMe,
    };
  }

  /** Logout ou reuso detectado: mata a sessão inteira, não só o token apresentado. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Lookup somente-leitura, usado pelo logout — não mexe no estado do token. */
  /**
   * Revoga todas as sessões do usuário. Usado quando a senha muda (RF-04):
   * refresh emitido com a senha antiga não pode continuar valendo.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async findFamilyIdByToken(token: string): Promise<string | null> {
    const record = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
      select: { familyId: true },
    });
    return record?.familyId ?? null;
  }
}
