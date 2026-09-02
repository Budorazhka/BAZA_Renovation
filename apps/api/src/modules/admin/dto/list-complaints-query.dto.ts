import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

const STATUSES = ['pending', 'resolved_upheld', 'resolved_dismissed'] as const;

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

/**
 * ADMIN-OPS-001: query-фильтры GET /admin/complaints — тот же паттерн, что
 * ListDuplicateCandidatesQueryDto. status без явного значения от клиента —
 * AdminComplaintService дефолтит на ['pending'] (очередь, реально нуждающаяся
 * в проверке).
 */
export class ListComplaintsQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_LIMIT)
  limit: number = DEFAULT_LIST_LIMIT;
}
