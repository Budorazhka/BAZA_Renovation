import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';

// Тот же паттерн лимитов, что ListPublicationsQueryDto (D-06).
export const DEFAULT_AUDIT_LIST_LIMIT = 20;
export const MAX_AUDIT_LIST_LIMIT = 100;

const AUDIT_RESOURCES = ['development', 'unit', 'listing', 'admin_account'] as const;

/**
 * GET /admin/audit-events query-фильтры. Все фильтры — ДОПОЛНИТЕЛЬНОЕ
 * клиентское сужение поверх уже разрешённого scope (AdminAuditService),
 * тот же принцип AND-сужения, что ListPublicationsQueryDto — resource
 * здесь ограничен явным enum'ом (не произвольная строка), т.к. это
 * единственный публично документированный набор resource-значений,
 * которые admin audit UI умеет показывать безопасно (whitelist-projection
 * в admin-audit-projection.ts привязан к конкретным action-строкам этих
 * resource).
 */
export class ListAuditEventsQueryDto {
  @IsOptional()
  @IsIn(AUDIT_RESOURCES)
  resource?: (typeof AUDIT_RESOURCES)[number];

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsMongoId()
  resourceId?: string;

  @IsOptional()
  @IsMongoId()
  publicationId?: string;

  @IsOptional()
  @IsMongoId()
  actorId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIT_LIST_LIMIT)
  limit: number = DEFAULT_AUDIT_LIST_LIMIT;
}
