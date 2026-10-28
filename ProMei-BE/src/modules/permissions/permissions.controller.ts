import { Controller, Get } from '@nestjs/common';
import { AnyAuthenticated, RequirePermission } from '../../shared/decorators';
import { PermissionsService } from './permissions.service';

/**
 * Catálogo de permissões disponíveis (RF-12).
 *
 * `@AnyAuthenticated` porque o catálogo é global — não tem `company_id` e é o
 * mesmo para plataforma e empresas. Quem monta a tela de papéis precisa dele.
 */
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @AnyAuthenticated()
  @RequirePermission('roles:read')
  async list(): Promise<string[]> {
    return this.permissionsService.listAvailable();
  }
}
