import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

// Тот же паттерн cursor+limit, что ListPublicationsQueryDto.
export const DEFAULT_LIST_ACCOUNTS_LIMIT = 20;
export const MAX_LIST_ACCOUNTS_LIMIT = 100;

export class ListAdminAccountsQueryDto {
  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_ACCOUNTS_LIMIT)
  limit: number = DEFAULT_LIST_ACCOUNTS_LIMIT;
}
