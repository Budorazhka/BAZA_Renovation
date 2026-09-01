import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

const STATUSES = ['detected', 'override_not_duplicate', 'confirmed_duplicate'] as const;

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

/**
 * Admin duplicate-candidates review queue (DEDUPE-001, mongodb-schema.md:
 * "{status:1} обслуживает admin-очередь detected/override_not_duplicate
 * для ручной проверки"). status без явного значения от клиента —
 * AdminDuplicateCandidateService дефолтит на ['detected',
 * 'override_not_duplicate'] (что реально нуждается в проверке); явный
 * ?status=confirmed_duplicate позволяет посмотреть уже закрытые записи
 * отдельно, не смешивая их с очередью по умолчанию.
 */
export class ListDuplicateCandidatesQueryDto {
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
