import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const UNIT_KINDS = ['apartment', 'commercial', 'office', 'parking', 'storage', 'other'] as const;
const UNIT_STATUSES = ['available', 'reserved', 'sold', 'hidden'] as const;

/**
 * D-02 COMPLETE: query-фильтры GET /buildings/:buildingId/units. Глобальный
 * ValidationPipe({whitelist:true, forbidNonWhitelisted:true}) отклоняет
 * любое поле вне этого класса (включая попытку передать organizationId) с
 * 400 до входа в контроллер — не post-hoc проверка, встроенная защита.
 * limit максимум 500 (задача) — @Max отклоняет явно, не молча капает.
 */
export class ListUnitsQueryDto {
  @IsOptional()
  @IsIn(UNIT_KINDS)
  kind?: (typeof UNIT_KINDS)[number];

  @IsOptional()
  @IsIn(UNIT_STATUSES)
  status?: (typeof UNIT_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 100;
}
