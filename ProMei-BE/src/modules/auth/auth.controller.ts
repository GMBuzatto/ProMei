import { Body, Controller, Post, HttpCode, Ip, SetMetadata } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordManagementService } from './password-management.service';
import { AnyAuthenticated, CurrentUser, Public, RequirePermission } from '../../shared/decorators';
import { ALLOW_PASSWORD_CHANGE_PENDING } from '../../shared/guards';
import type { AuthenticatedUser } from '../../shared/logging';

/**
 * Rate limit estrito em /auth/* (docs/09-seguranca.md), mais restritivo que o global.
 * Valores vêm de AUTH_LOGIN_RATE_LIMIT_MAX / AUTH_LOGIN_RATE_LIMIT_TTL_MS no .env
 * (mesmos defaults do schema em env.config.ts).
 *
 * @Throttle roda na definição da classe, antes do Nest montar o container de DI —
 * não dá para injetar ConfigService aqui. Por isso usamos a forma "resolvable" do
 * @nestjs/throttler (função em vez de literal), que só executa a cada request, quando
 * o ConfigModule já carregou o .env em process.env.
 */
const authRateLimitMaxSchema = z.coerce.number().int().positive().default(5);
const authRateLimitTtlMsSchema = z.coerce.number().int().positive().default(60_000);

function resolveAuthRateLimit(): number {
  return authRateLimitMaxSchema.parse(process.env.AUTH_LOGIN_RATE_LIMIT_MAX);
}

function resolveAuthRateLimitTtlMs(): number {
  return authRateLimitTtlMsSchema.parse(process.env.AUTH_LOGIN_RATE_LIMIT_TTL_MS);
}

const AUTH_THROTTLE = { default: { limit: resolveAuthRateLimit, ttl: resolveAuthRateLimitTtlMs } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordManagement: PasswordManagementService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Public()
  @Throttle(AUTH_THROTTLE)
  async login(@Body() loginDto: LoginDto, @Ip() ip: string): Promise<AuthResponseDto> {
    return this.authService.login(
      loginDto.email,
      loginDto.password,
      loginDto.rememberMe ?? false,
      ip,
    );
  }

  @Post('refresh')
  @HttpCode(200)
  @Public()
  @Throttle(AUTH_THROTTLE)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Ip() ip: string,
  ): Promise<AuthResponseDto> {
    return this.authService.refresh(refreshTokenDto.refreshToken, ip);
  }

  @Post('logout')
  @HttpCode(200)
  @Public()
  @Throttle(AUTH_THROTTLE)
  async logout(@Body() refreshTokenDto: RefreshTokenDto, @Ip() ip: string): Promise<void> {
    return this.authService.logout(refreshTokenDto.refreshToken, ip);
  }

  /**
   * RF-04: troca pelo próprio usuário, exigindo a senha atual.
   * Liberada mesmo com troca pendente — é justamente aqui que ela é resolvida.
   */
  @Post('change-password')
  @HttpCode(204)
  @AnyAuthenticated()
  @SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING, true)
  @Throttle(AUTH_THROTTLE)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
  ): Promise<void> {
    return this.passwordManagement.changeOwnPassword(
      user.sub as string,
      dto.currentPassword,
      dto.newPassword,
      ip,
    );
  }

  /**
   * RF-04: reset por admin. A senha é definida pelo admin e repassada por fora.
   *
   * `@AnyAuthenticated` porque tanto Admin de empresa quanto Super Admin/Staff
   * resetam senha; o escopo de quem pode ser resetado é validado no service.
   */
  @Post('reset-password')
  @HttpCode(204)
  @AnyAuthenticated()
  @RequirePermission('users:update')
  @Throttle(AUTH_THROTTLE)
  async resetPassword(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ResetPasswordDto,
    @Ip() ip: string,
  ): Promise<void> {
    return this.passwordManagement.resetPasswordAsAdmin(
      admin.sub,
      admin.company_id,
      dto.userId,
      dto.newPassword,
      ip,
    );
  }
}
