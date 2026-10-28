import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import * as jwt from 'jsonwebtoken';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createFastifyAdapter } from '../../src/shared/http';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface ErrorResponse {
  message: string;
  code?: string;
}

// Teste de integração roda contra Postgres real (docs/12-estrategia-de-testes.md).
// Em vez de depender de um banco já configurado no ambiente (CI ou local), o próprio
// teste sobe um container Postgres efêmero via testcontainers — funciona em qualquer
// lugar com Docker (incluindo runners do GitHub Actions, que já vêm com Docker), sem
// exigir infra provisionada fora deste arquivo.
const CONTAINER_TIMEOUT_MS = 120_000;

describe('Auth Integration Tests - RF-01 (Login com JWT)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let testCompany: { id: string };
  let testRole: { id: string };
  let testUser: { id: string; email: string };
  const testPassword = 'ValidPassword123!';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('promei')
      .withUsername('promei')
      .withPassword('promei')
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-nao-e-segredo-real';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-nao-e-segredo-real';

    execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit' });

    // Import dinâmico, e só depois de setar process.env acima: `AppModule` importa
    // (transitivamente) ConfigModule, cujo `NestConfigModule.forRoot({ validate })`
    // roda a validação Zod no próprio module-load — um `import` estático no topo do
    // arquivo executaria essa validação antes do container/env estarem prontos.
    const { AppModule } = await import('../../src/app.module.js');

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Mesma configuracao de producao (inclui o genReqId do correlation id).
    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());

    // Register global pipes for validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    app.setGlobalPrefix('/api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    passwordService = moduleRef.get<PasswordService>(PasswordService);
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(async () => {
    // Clean up database - delete in reverse order of dependencies
    await prisma.auditLog.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.receipt.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.item.deleteMany({});
    await prisma.company.deleteMany({});

    // Create test company
    testCompany = await prisma.company.create({
      data: {
        name: 'Test Company',
        document: `doc_${Date.now()}`,
      },
    });

    // Create test role
    testRole = await prisma.role.create({
      data: {
        name: 'Admin',
        companyId: testCompany.id,
      },
    });

    // Create test user with hashed password
    const passwordHash = await passwordService.hashPassword(testPassword);
    testUser = await prisma.user.create({
      data: {
        email: `user_${Date.now()}@test.com`,
        passwordHash,
        companyId: testCompany.id,
      },
    });

    // Assign role to user
    await prisma.userRole.create({
      data: {
        userId: testUser.id,
        roleId: testRole.id,
      },
    });
  });

  afterAll(async () => {
    // Se o beforeAll falhou antes de criar a app (ex.: config/banco indisponível),
    // `app` nunca foi atribuída — evita mascarar o erro real com um TypeError aqui.
    if (app) {
      await app.close();
    }
    if (container) {
      await container.stop();
    }
  }, CONTAINER_TIMEOUT_MS);

  describe('POST /auth/login', () => {
    it('should successfully login with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as AuthResponseDto;

      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body).toHaveProperty('expiresIn');
      expect(body.expiresIn).toBe(15 * 60); // 15 minutes in seconds
    });

    it('should return tokens with correct JWT payload (RF-01 acceptance)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as AuthResponseDto;

      // Decode access token
      const decoded = jwt.decode(body.accessToken) as Record<string, unknown>;

      expect(decoded).toHaveProperty('sub');
      expect(decoded.sub).toBe(testUser.id);

      expect(decoded).toHaveProperty('company_id');
      expect(decoded.company_id).toBe(testCompany.id);

      expect(decoded).toHaveProperty('roles');
      expect(Array.isArray(decoded.roles)).toBe(true);
      expect(decoded.roles).toContain('Admin');

      expect(decoded).toHaveProperty('type');
      expect(decoded.type).toBe('access');
    });

    it('should return refresh token with correct payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as AuthResponseDto;

      const decoded = jwt.decode(body.refreshToken) as Record<string, unknown>;

      expect(decoded).toHaveProperty('sub');
      expect(decoded.sub).toBe(testUser.id);

      expect(decoded).toHaveProperty('company_id');
      expect(decoded.company_id).toBe(testCompany.id);

      expect(decoded).toHaveProperty('type');
      expect(decoded.type).toBe('refresh');
    });

    it('should fail when email does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'nonexistent@test.com',
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.message).toBe('Invalid email or password');
    });

    it('should fail when password is incorrect', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: 'WrongPassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.message).toBe('Invalid email or password');
    });

    it('should increment failed login attempts on wrong password', async () => {
      const userBefore = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(userBefore?.failedLoginAttempts).toBe(0);

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: 'WrongPassword123!',
        },
      });

      const userAfter = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(userAfter?.failedLoginAttempts).toBe(1);
    });

    it('should lock account after 5 failed login attempts', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: testUser.email,
            password: 'WrongPassword123!',
          },
        });
      }

      const userLocked = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(userLocked?.failedLoginAttempts).toBe(5);
      expect(userLocked?.lockedUntil).toBeTruthy();
      expect(userLocked?.lockedUntil).toBeInstanceOf(Date);
    });

    it('should reject login when account is locked', async () => {
      // Lock account
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: testUser.email,
            password: 'WrongPassword123!',
          },
        });
      }

      // Try to login with correct password
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.message).toContain('temporarily locked');
    });

    it('should reset failed attempts on successful login', async () => {
      // Make one failed attempt
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: 'WrongPassword123!',
        },
      });

      // Verify attempt was recorded
      let user = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(user?.failedLoginAttempts).toBe(1);

      // Successful login
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify counter was reset
      user = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(user?.failedLoginAttempts).toBe(0);
      expect(user?.lockedUntil).toBeNull();
    });

    it('should validate request payload - missing email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate request payload - invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'not-an-email',
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate request payload - missing password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/refresh (RF-02)', () => {
    async function login(): Promise<AuthResponseDto> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testUser.email, password: testPassword },
      });
      return JSON.parse(response.payload) as AuthResponseDto;
    }

    it('should rotate the refresh token and issue a new pair', async () => {
      const original = await login();

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: original.refreshToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as AuthResponseDto;

      // Rotação: novo refresh token, sempre distinto do anterior (jti garante isso).
      // accessToken pode coincidir se emitido no mesmo segundo com os mesmos claims
      // (não é hash-checado no banco, então não há problema de unicidade ali).
      expect(body.refreshToken).not.toBe(original.refreshToken);
    });

    it('should reject an unknown refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'not-a-real-token' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.code).toBe('REFRESH_INVALIDO');
    });

    it('should invalidate the whole session when a rotated-out refresh token is reused (acceptance criteria)', async () => {
      const original = await login();

      // Primeira rotação: token original vira "usado".
      const firstRotation = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: original.refreshToken },
      });
      expect(firstRotation.statusCode).toBe(200);
      const rotated = JSON.parse(firstRotation.payload) as AuthResponseDto;

      // Reuso do token original (já rotacionado) → sessão inteira invalidada.
      const reuseAttempt = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: original.refreshToken },
      });
      expect(reuseAttempt.statusCode).toBe(401);
      const reuseBody = JSON.parse(reuseAttempt.payload) as ErrorResponse;
      expect(reuseBody.code).toBe('SESSAO_INVALIDADA');

      // O token mais recente da família (emitido na rotação legítima) também
      // deixa de funcionar — a sessão inteira foi derrubada, não só o reuso.
      const afterInvalidation = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: rotated.refreshToken },
      });
      expect(afterInvalidation.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout (RF-02)', () => {
    it('should revoke the session so the refresh token stops working', async () => {
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testUser.email, password: testPassword },
      });
      const tokens = JSON.parse(loginResponse.payload) as AuthResponseDto;

      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken: tokens.refreshToken },
      });
      expect(logoutResponse.statusCode).toBe(200);

      const refreshAfterLogout = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: tokens.refreshToken },
      });
      expect(refreshAfterLogout.statusCode).toBe(401);
    });

    it('should be idempotent for an unknown refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken: 'not-a-real-token' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /auth/login with rememberMe (Feature: Extended Refresh Token TTL)', () => {
    it('should issue refresh token with 7-day expiry when rememberMe is false', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
          rememberMe: false,
        },
      });

      expect(response.statusCode).toBe(200);

      // Retrieve stored token from database to check expiry
      const tokenRecord = await prisma.refreshToken.findFirst({
        where: { userId: testUser.id },
      });

      expect(tokenRecord).toBeDefined();
      expect(tokenRecord?.rememberMe).toBe(false);

      // Check expiry is approximately 7 days from now
      const now = Date.now();
      const expiryTime = tokenRecord!.expiresAt.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(expiryTime - now).toBeGreaterThan(sevenDaysMs - 5000);
      expect(expiryTime - now).toBeLessThan(sevenDaysMs + 5000);
    });

    it('should issue refresh token with 15-day expiry when rememberMe is true', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
          rememberMe: true,
        },
      });

      expect(response.statusCode).toBe(200);

      // Retrieve stored token from database to check expiry
      const tokenRecord = await prisma.refreshToken.findFirst({
        where: { userId: testUser.id },
      });

      expect(tokenRecord).toBeDefined();
      expect(tokenRecord?.rememberMe).toBe(true);

      // Check expiry is approximately 15 days from now
      const now = Date.now();
      const expiryTime = tokenRecord!.expiresAt.getTime();
      const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
      expect(expiryTime - now).toBeGreaterThan(fifteenDaysMs - 5000);
      expect(expiryTime - now).toBeLessThan(fifteenDaysMs + 5000);
    });

    it('should preserve rememberMe flag after token rotation (RF-02)', async () => {
      // Initial login with rememberMe=true
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
          rememberMe: true,
        },
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginBody = JSON.parse(loginResponse.payload) as AuthResponseDto;

      // Rotate the refresh token
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: loginBody.refreshToken },
      });

      expect(refreshResponse.statusCode).toBe(200);

      // Check new token also has 15-day expiry (and rememberMe=true)
      const rotatedTokenRecord = await prisma.refreshToken.findFirst({
        where: {
          userId: testUser.id,
          revokedAt: null, // The new unrevoked token
        },
      });

      expect(rotatedTokenRecord).toBeDefined();
      expect(rotatedTokenRecord?.rememberMe).toBe(true);

      const now = Date.now();
      const expiryTime = rotatedTokenRecord!.expiresAt.getTime();
      const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
      expect(expiryTime - now).toBeGreaterThan(fifteenDaysMs - 5000);
      expect(expiryTime - now).toBeLessThan(fifteenDaysMs + 5000);
    });

    it('should default to rememberMe=false when not specified', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testUser.email,
          password: testPassword,
          // rememberMe not provided
        },
      });

      expect(response.statusCode).toBe(200);

      const tokenRecord = await prisma.refreshToken.findFirst({
        where: { userId: testUser.id },
      });

      expect(tokenRecord?.rememberMe).toBe(false);
    });
  });
});
