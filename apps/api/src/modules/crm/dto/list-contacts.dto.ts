import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_CONTACT_LIST_LIMIT = 20;
export const MAX_CONTACT_LIST_LIMIT = 100;

export class ListContactsDto {
  /** Единый поиск по name/phone (partial, регистронезависимый) — не два отдельных query-параметра. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CONTACT_LIST_LIMIT)
  limit: number = DEFAULT_CONTACT_LIST_LIMIT;
}
