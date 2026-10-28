export interface UserResponseDto {
  id: string;
  email: string;
  status: string;
  mustChangePassword: boolean;
  roles: string[];
  createdAt: Date;
}
