import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_LEAD_EVENT_LIST_LIMIT = 20;
export const MAX_LEAD_EVENT_LIST_LIMIT = 100;

export class ListLeadEventsDto {
  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LEAD_EVENT_LIST_LIMIT)
  limit: number = DEFAULT_LEAD_EVENT_LIST_LIMIT;
}
