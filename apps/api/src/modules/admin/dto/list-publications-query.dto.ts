import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';

const SOURCE_TYPES = ['development', 'unit', 'listing'] as const;

// Тот же паттерн, что SearchPublicDevelopmentsQueryDto (D-04A).
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

/**
 * D-06: query-фильтры GET /admin/publications. sourceType/city здесь —
 * ДОПОЛНИТЕЛЬНОЕ клиентское сужение поверх уже разрешённого read-scope
 * (AdminPolicyService.resolvePublicationReadScope) — они НЕ расширяют
 * права, только фильтруют уже допущенный набор (AND, не OR, см.
 * AdminPublicationService.list). Без bbox — не нужен для admin-поиска.
 */
export class ListPublicationsQueryDto {
  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsString()
  city?: string;

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
