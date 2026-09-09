import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';

const ORGANIZATION_TYPES = ['agency', 'developer', 'independent_realtor'] as const;
const ORGANIZATION_STATUSES = ['active', 'frozen', 'archived'] as const;

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

export class ListAdminOrganizationsQueryDto {
  @IsOptional()
  @IsIn(ORGANIZATION_TYPES)
  type?: (typeof ORGANIZATION_TYPES)[number];

  @IsOptional()
  @IsIn(ORGANIZATION_STATUSES)
  status?: (typeof ORGANIZATION_STATUSES)[number];

  @IsOptional()
  @IsString()
  search?: string;

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
