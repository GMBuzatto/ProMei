import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import type { RoleResponseDto } from './dto/role-response.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

/**
 * CRUD de papéis por empresa (RF-12) e vínculo usuário↔papel (RN-04).
 *
 * Rota de tenant: usuário de plataforma recebe 404 pelo PermissionsGuard.
 */
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('roles:read')
  async list(@CurrentUser() user: AuthenticatedUser): Promise<RoleResponseDto[]> {
    return this.rolesService.list(user.company_id);
  }

  @Get(':id')
  @RequirePermission('roles:read')
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RoleResponseDto> {
    return this.rolesService.findById(id, user.company_id);
  }

  @Post()
  @RequirePermission('roles:create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoleDto,
    @Ip() ip: string,
  ): Promise<RoleResponseDto> {
    return this.rolesService.create(
      user.company_id as string,
      dto.name,
      dto.permissions,
      user.sub,
      ip,
    );
  }

  @Patch(':id')
  @RequirePermission('roles:update')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Ip() ip: string,
  ): Promise<RoleResponseDto> {
    return this.rolesService.update(id, user.company_id, dto, user.sub, ip);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('roles:delete')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.rolesService.remove(id, user.company_id, user.sub, ip);
  }

  /** Atribuir papel exige poder alterar o usuário, não só o papel. */
  @Post('users/:userId')
  @HttpCode(204)
  @RequirePermission('users:update')
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
    @Ip() ip: string,
  ): Promise<void> {
    return this.rolesService.assignToUser(userId, dto.roleId, user.company_id, user.sub, ip);
  }

  @Delete('users/:userId/:roleId')
  @HttpCode(204)
  @RequirePermission('users:update')
  async unassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.rolesService.removeFromUser(userId, roleId, user.company_id, user.sub, ip);
  }
}
