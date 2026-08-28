import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, ValidateNested } from 'class-validator';

class GeoPointDto {
  @IsIn(['Point'])
  type!: 'Point';

  @IsNumber({}, { each: true })
  coordinates!: [number, number];
}

class PropertyLocationDto {
  @IsString()
  @Length(1, 100)
  country!: string;

  @IsString()
  @Length(1, 100)
  city!: string;

  @IsString()
  @Length(1, 300)
  address!: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  geo!: GeoPointDto;
}

class PropertyCharacteristicsDto {
  @IsNumber()
  @IsPositive()
  area!: number;

  @IsOptional()
  @IsInt()
  rooms?: number;

  @IsOptional()
  @IsInt()
  floor?: number;

  @IsOptional()
  @IsInt()
  totalFloors?: number;
}

export class CreatePropertyAssetDto {
  @IsIn(['apartment', 'house', 'land', 'commercial'])
  propertyType!: 'apartment' | 'house' | 'land' | 'commercial';

  @IsOptional()
  @IsIn(['office', 'warehouse', 'retail', 'business', 'free_purpose'])
  commercialSubtype?: 'office' | 'warehouse' | 'retail' | 'business' | 'free_purpose';

  @ValidateNested()
  @Type(() => PropertyLocationDto)
  location!: PropertyLocationDto;

  @ValidateNested()
  @Type(() => PropertyCharacteristicsDto)
  characteristics!: PropertyCharacteristicsDto;

  /**
   * DEDUPE-001: обязательное поле — dedupe-сигналы (owner decision xlsx
   * #58) физически не могут сработать без него. `+` и цифры — минимальная
   * структурная проверка, не полноценный E.164-парсинг (libphonenumber не
   * подключён, вне scope этой задачи).
   */
  @IsString()
  @Matches(/^\+?[\d\s-]{6,20}$/, { message: 'representativePhone must contain only digits, spaces, dashes and an optional leading +' })
  representativePhone!: string;
}
