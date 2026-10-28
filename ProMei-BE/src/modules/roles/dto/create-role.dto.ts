import { ArrayUnique, IsArray, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Formato `recurso:ação`, o mesmo que o `@RequirePermission` usa (RF-12). */
export const PERMISSION_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsArray()
  @ArrayUnique()
  @Matches(PERMISSION_PATTERN, {
    each: true,
    message: 'cada permissão deve estar no formato recurso:ação (ex.: items:create)',
  })
  permissions!: string[];
}
