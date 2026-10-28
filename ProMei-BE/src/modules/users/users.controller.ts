import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * CRUD de usuários da empresa (RN-02). Rota de tenant: o Admin gerencia apenas
 * a própria empresa, e usuário de plataforma recebe 404 pelo PermissionsGuard.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users:read')
  async list(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto[]> {
    return this.usersService.list(user.company_id as string);
  }

  @Get(':id')
  @RequirePermission('users:read')
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<UserResponseDto> {
    return this.usersService.findById(id, user.company_id as string);
  }

  @Post()
  @RequirePermission('users:create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
    @Ip() ip: string,
  ): Promise<UserResponseDto> {
    return this.usersService.create(user.company_id as string, dto, user.sub, ip);
  }

  @Patch(':id')
  @RequirePermission('users:update')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Ip() ip: string,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, user.company_id as string, dto, user.sub, ip);
  }

  /** Desativa em vez de excluir: o usuário tem histórico apontando para ele. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('users:delete')
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.usersService.deactivate(id, user.company_id as string, user.sub, ip);
  }
}
