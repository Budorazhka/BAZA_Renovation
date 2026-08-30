import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, Validate } from 'class-validator';
import { IsBboxConstraint } from './is-bbox.constraint';
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from './search-public-developments-query.dto';

const DEAL_TYPES = ['sale', 'rent_long', 'rent_short'] as const;
const PROPERTY_TYPES = ['apartment', 'house', 'land', 'commercial'] as const;
const COMMERCIAL_SUBTYPES = ['office', 'warehouse', 'retail', 'business', 'free_purpose'] as const;
export const PUBLIC_LISTING_SORTS = ['newest', 'price_asc', 'price_desc', 'area_asc', 'area_desc'] as const;

/**
 * MKT-002: query-фильтры GET /public/listings — тот же паттерн, что
 * SearchPublicDevelopmentsQueryDto (D-04A). Глобальный
 * ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})
 * отклоняет любое поле вне этого класса с 400 ДО входа в контроллер.
 */
export class SearchPublicListingsQueryDto {
  @IsOptional()
  @IsIn(DEAL_TYPES)
  dealType?: (typeof DEAL_TYPES)[number];

  @IsOptional()
  @IsIn(PROPERTY_TYPES)
  propertyType?: (typeof PROPERTY_TYPES)[number];

  @IsOptional()
  @IsIn(COMMERCIAL_SUBTYPES)
  commercialSubtype?: (typeof COMMERCIAL_SUBTYPES)[number];

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn(PUBLIC_LISTING_SORTS)
  sort?: (typeof PUBLIC_LISTING_SORTS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_LIMIT)
  limit: number = DEFAULT_LIST_LIMIT;

  @IsOptional()
  @Validate(IsBboxConstraint)
  bbox?: string;
}
