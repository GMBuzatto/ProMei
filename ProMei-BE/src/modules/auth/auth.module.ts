import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { PasswordManagementService } from './password-management.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtService,
    PasswordService,
    RefreshTokenService,
    PasswordManagementService,
  ],
  exports: [JwtService, PasswordService],
})
export class AuthModule {}
