import { Body, Controller, Get, HttpCode, Ip, Put } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import { SetAdminPasswordDto } from './dto/set-admin-password.dto';
import { UpdateFinanceSettingsDto } from './dto/update-finance-settings.dto';
import {
  FinanceSettingsService,
  type FinanceSettingsUpdateResult,
  type FinanceSettingsView,
} from './finance-settings.service';

/**
 * Configuração financeira da PRÓPRIA empresa (docs/20, docs/27).
 *
 * `me` na rota, e não `:companyId`, de propósito: a empresa vem sempre do
 * `company_id` do JWT (`@CurrentUser`), nunca de um parâmetro que o cliente
 * digita — um `:companyId` na URL seria IDOR esperando para acontecer (um
 * Admin trocando o id na barra de endereço e lendo/alterando o financeiro de
 * outra empresa).
 *
 * Permissão é `finance-settings:*`, não `companies:*`: `companies` é recurso
 * de plataforma (RN-01/RN-05) e o Admin de empresa não o possui. Dar
 * `companies:*` ao Admin só por causa desta tela concederia uma permissão
 * cujo nome sugere administrar empresas, não a própria configuração.
 *
 * Rota de tenant (sem `@PlatformRoute`): usuário de plataforma recebe 404 na
 * fronteira do `PermissionsGuard`, o mesmo tratamento de rota inexistente.
 */
@Controller('companies/me/finance-settings')
export class FinanceSettingsController {
  constructor(private readonly financeSettingsService: FinanceSettingsService) {}

  @Get()
  @RequirePermission('finance-settings:read')
  getMySettings(@CurrentUser() user: AuthenticatedUser): Promise<FinanceSettingsView> {
    return this.financeSettingsService.getMySettings(user.company_id as string);
  }

  @Put()
  @RequirePermission('finance-settings:update')
  updateMySettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateFinanceSettingsDto,
    @Ip() ip: string,
  ): Promise<FinanceSettingsUpdateResult> {
    return this.financeSettingsService.updateMySettings(
      user.company_id as string,
      dto,
      user.sub,
      ip,
    );
  }

  /**
   * PD-13: uma senha administrativa por empresa, não por usuário. Exige a
   * senha de LOGIN de quem chama (`currentPassword`) — nunca a senha
   * administrativa anterior, que pode ser exatamente o que está sendo
   * esquecido ou trocado por ter vazado.
   */
  @Put('admin-password')
  @HttpCode(204)
  @RequirePermission('finance-settings:update')
  setAdminPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetAdminPasswordDto,
    @Ip() ip: string,
  ): Promise<void> {
    return this.financeSettingsService.setAdminPassword(
      user.company_id as string,
      user.sub as string,
      dto,
      ip,
    );
  }
}
