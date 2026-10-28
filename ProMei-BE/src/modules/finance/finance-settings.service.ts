import { HttpStatus, Injectable } from '@nestjs/common';
import type { CompanyFinanceSettings } from '../../generated/prisma/client';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import type { SetAdminPasswordDto } from './dto/set-admin-password.dto';
import type { UpdateFinanceSettingsDto } from './dto/update-finance-settings.dto';
import { type FinancialPeriod, nextPeriod, resolvePeriod } from './period';

const FINANCE_SETTINGS_RESOURCE = 'finance-settings';

/**
 * O que a API expõe. Nunca os campos de senha administrativa
 * (`adminPasswordHash` e o lockout que o acompanha) — essa família de dados
 * pertence à rota de senha administrativa (docs/24), não a esta.
 */
export interface FinanceSettingsView {
  companyId: string;
  closingDay: number;
  timezone: string;
  delinquencyDays: number;
  defaultDueDays: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * RN-54: mudar `closingDay`/`timezone` vale a partir do PRÓXIMO período — o
 * período em curso já foi congelado nas vendas com a configuração anterior.
 * `currentPeriod` é resolvido com a configuração ANTES da troca (o que
 * continua valendo até fechar); `nextPeriod` é o primeiro período sob a
 * configuração nova. A UI usa os dois para avisar exatamente quando a
 * mudança passa a valer.
 */
export interface FinanceSettingsUpdateResult extends FinanceSettingsView {
  currentPeriod: FinancialPeriod;
  nextPeriod: FinancialPeriod;
}

function toView(settings: CompanyFinanceSettings): FinanceSettingsView {
  return {
    companyId: settings.companyId,
    closingDay: settings.closingDay,
    timezone: settings.timezone,
    delinquencyDays: settings.delinquencyDays,
    defaultDueDays: settings.defaultDueDays,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

/** Só os campos alteráveis, para o `diff` da auditoria (RNF-06) — sem `Date`, que `Json` do Prisma não aceita. */
function toAuditDiff(settings: CompanyFinanceSettings) {
  return {
    closingDay: settings.closingDay,
    timezone: settings.timezone,
    delinquencyDays: settings.delinquencyDays,
    defaultDueDays: settings.defaultDueDays,
  };
}

@Injectable()
export class FinanceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwordService: PasswordService,
  ) {}

  async getMySettings(companyId: string): Promise<FinanceSettingsView> {
    return toView(await this.findByCompany(companyId));
  }

  async updateMySettings(
    companyId: string,
    dto: UpdateFinanceSettingsDto,
    actorId?: string,
    ip?: string,
  ): Promise<FinanceSettingsUpdateResult> {
    const before = await this.findByCompany(companyId);

    // Resolvido ANTES do update, com a configuração ainda vigente: é o
    // período que sales.service.ts continua a congelar em vendas novas até
    // este período acabar de verdade (RN-54).
    const currentPeriod = resolvePeriod(new Date(), before.closingDay, before.timezone);

    const updated = await this.prisma.db.companyFinanceSettings.update({
      where: { companyId },
      data: {
        closingDay: dto.closingDay,
        timezone: dto.timezone,
        delinquencyDays: dto.delinquencyDays,
        defaultDueDays: dto.defaultDueDays,
      },
    });

    await this.audit.log({
      action: 'finance-settings.updated',
      resource: FINANCE_SETTINGS_RESOURCE,
      userId: actorId,
      companyId,
      diff: {
        before: toAuditDiff(before),
        after: toAuditDiff(updated),
      },
      ip,
    });

    return {
      ...toView(updated),
      currentPeriod,
      // Primeiro período sob a configuração nova: começa exatamente onde o
      // período em curso termina (intervalo semiaberto — docs/20).
      nextPeriod: nextPeriod(currentPeriod, updated.closingDay, updated.timezone),
    };
  }

  /**
   * Define/troca a senha administrativa da empresa (docs/20, docs/24, PD-13).
   *
   * Exige a senha de LOGIN de quem está chamando — não a senha administrativa
   * antiga. Se a antiga foi esquecida ou vazou, exigi-la travaria a empresa
   * para fora justamente na situação em que ela precisa ser trocada.
   *
   * Consequências assumidas, documentadas aqui para não serem
   * "redescobertas" depois:
   *   - a senha em si não identifica quem liberou uma venda — quem grava
   *     `authorized_by` é o JWT de quem chamou. Aceitável porque a senha é o
   *     SEGUNDO fator, não o único;
   *   - o lockout por tentativas erradas (`adminPasswordFailedAttempts`/
   *     `adminPasswordLockedUntil`) é usado pelo fluxo de LIBERAÇÃO
   *     (docs/24, épico 12), não por esta rota de definição. Redefinir a
   *     senha aqui zera esses contadores: eles descrevem tentativas contra a
   *     senha ANTERIOR, que deixou de existir.
   */
  async setAdminPassword(
    companyId: string,
    userId: string,
    dto: SetAdminPasswordDto,
    ip?: string,
  ): Promise<void> {
    await this.findByCompany(companyId);

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
      dto.currentPassword,
    );

    if (!currentPasswordValid) {
      await this.audit.log({
        action: 'finance-settings.admin_password_set_failed',
        resource: FINANCE_SETTINGS_RESOURCE,
        userId,
        companyId,
        diff: { reason: 'invalid_current_password' },
        ip,
      });

      throw new BusinessException(
        BusinessErrorCode.SENHA_ATUAL_INCORRETA,
        'Current password is incorrect',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const adminPasswordHash = await this.passwordService.hashPassword(dto.newAdminPassword);

    await this.prisma.db.companyFinanceSettings.update({
      where: { companyId },
      data: {
        adminPasswordHash,
        adminPasswordUpdatedAt: new Date(),
        adminPasswordFailedAttempts: 0,
        adminPasswordLockedUntil: null,
      },
    });

    await this.audit.log({
      action: 'finance-settings.admin_password_set',
      resource: FINANCE_SETTINGS_RESOURCE,
      userId,
      companyId,
      // Nunca o hash nem a senha em texto — só o fato de que ela mudou.
      diff: { changed: true },
      ip,
    });
  }

  /**
   * 404 aqui significa empresa provisionada antes do backfill da fase 2 (ou
   * provisionamento ainda não atualizado para criar a linha) — não é um
   * estado que a UI deveria conseguir provocar em uso normal.
   */
  private async findByCompany(companyId: string): Promise<CompanyFinanceSettings> {
    const settings = await this.prisma.db.companyFinanceSettings.findUnique({
      where: { companyId },
    });

    if (!settings) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Configuração financeira da empresa não encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    return settings;
  }
}
