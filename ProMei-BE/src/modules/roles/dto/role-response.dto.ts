export interface RoleResponseDto {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  usersCount?: number;
}
