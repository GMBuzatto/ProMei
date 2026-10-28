export interface AuditLogResponseDto {
  id: string;
  action: string;
  resource: string;
  userId: string | null;
  companyId: string | null;
  diff: unknown;
  ip: string | null;
  createdAt: Date;
}

export interface PaginatedAuditLogs {
  data: AuditLogResponseDto[];
  total: number;
  page: number;
  limit: number;
}
