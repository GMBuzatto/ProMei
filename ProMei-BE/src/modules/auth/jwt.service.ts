import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign, verify } from 'jsonwebtoken';
import type { SignOptions, VerifyOptions } from 'jsonwebtoken';
import type { Env } from '../../shared/config';

export interface JwtPayload {
  sub: string;
  company_id: string | null;
  roles: string[];
  permissions?: string[]; // ex: ["items:create", "inventory:read"]
  /**
   * RF-04: marca que a senha foi definida por um admin e precisa ser trocada.
   * Vai no token para o guard não precisar consultar o banco a cada request;
   * como o access dura 15 min e o reset revoga as sessões, a janela é curta.
   */
  must_change_password?: boolean;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  /** Segundos — vêm de JWT_ACCESS_TTL/JWT_REFRESH_TTL, nunca hardcoded (docs/16). */
  private readonly accessTokenExpirySeconds: number;
  private readonly refreshTokenExpirySeconds: number;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTokenExpirySeconds = this.config.get('JWT_ACCESS_TTL', { infer: true });
    this.refreshTokenExpirySeconds = this.config.get('JWT_REFRESH_TTL', { infer: true });
  }

  generateAccessToken(payload: Omit<JwtPayload, 'type'>): string {
    return sign({ ...payload, type: 'access' }, this.accessSecret, {
      expiresIn: this.accessTokenExpirySeconds,
    } as SignOptions);
  }

  generateRefreshToken(payload: Omit<JwtPayload, 'type'>): string {
    // jti garante unicidade mesmo quando dois refresh tokens são emitidos no
    // mesmo segundo para o mesmo usuário (assinatura HS256 é determinística e
    // `iat` tem granularidade de segundo — sem isso, tokens colidiriam e a
    // rotação em refresh_tokens.token_hash violaria a constraint @unique).
    return sign({ ...payload, type: 'refresh', jti: randomUUID() }, this.refreshSecret, {
      expiresIn: this.refreshTokenExpirySeconds,
    } as SignOptions);
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      const verifyOptions: VerifyOptions = {};
      const decoded = verify(token, this.accessSecret, verifyOptions) as JwtPayload;
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch {
      throw new Error('Invalid or expired access token');
    }
  }

  verifyRefreshToken(token: string): JwtPayload {
    try {
      const verifyOptions: VerifyOptions = {};
      const decoded = verify(token, this.refreshSecret, verifyOptions) as JwtPayload;
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch {
      throw new Error('Invalid or expired refresh token');
    }
  }

  getAccessTokenExpiry(): number {
    return this.accessTokenExpirySeconds;
  }

  getRefreshTokenExpiry(): number {
    return this.refreshTokenExpirySeconds;
  }
}
