import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';
import { DEFAULT_AUDIT_LIST_LIMIT, MAX_AUDIT_LIST_LIMIT } from './list-audit-events-query.dto';

/** GET /admin/publications/:publicationId/audit query-фильтры — resource/resourceId фиксированы publicationId из path. */
export class ListPublicationAuditQueryDto {
  @IsOptional()
  @IsString()
  action?: string;

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
