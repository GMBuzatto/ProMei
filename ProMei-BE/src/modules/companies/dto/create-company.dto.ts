import { CompanySegment } from '../../../generated/prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../../auth/dto/change-password.dto';

/**
 * Criar empresa é **provisionar** empresa (RF-20).
 *
 * O admin inicial não é opcional de propósito. Antes desta versão o `POST`
 * criava só a linha em `companies`, e não havia rota nenhuma capaz de criar o
 * primeiro usuário dela: `POST /users` e `POST /roles` são rotas de tenant, e
 * um Super Admin recebe 404 nelas pela fronteira do `PermissionsGuard`. O
 * resultado era uma empresa que ninguém conseguia acessar — estado que só
 * existia para ser corrigido à mão no banco.
 *
 * Tornar o admin obrigatório fecha esse estado: ou a empresa nasce utilizável,
 * ou não nasce.
 */
export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  document: string;

  @IsEnum(CompanySegment)
  segment: CompanySegment;

  /** E-mail do primeiro Admin da empresa. É por ele que o cliente entra. */
  @IsEmail()
  adminEmail: string;

  /**
   * Senha inicial. Como quem define é outra pessoa, o usuário nasce com
   * `mustChangePassword` e troca no primeiro acesso (RF-04).
   */
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `adminPassword must be at least ${MIN_PASSWORD_LENGTH} characters long`,
  })
  adminPassword: string;

  /**
   * Plano da assinatura inicial. Opcional: pela tabela de decisão do docs/04,
   * empresa sem assinatura tem acesso normal — a ausência é estado transitório
   * de provisionamento, não inadimplência. Deixar obrigatório impediria criar a
   * empresa antes de fechar o comercial.
   */
  @IsOptional()
  @IsUUID()
  planId?: string;
}
