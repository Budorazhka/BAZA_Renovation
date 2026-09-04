import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Min, Max, ValidateNested } from 'class-validator';

const CURRENCIES = ['USD', 'GEL', 'RUB'] as const;

export class UpdateListingPriceDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinorUnits!: number;

  @IsIn(CURRENCIES)
  currency!: (typeof CURRENCIES)[number];
}

export class UpdateListingCharacteristicsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  area?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  rooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-5)
  @Max(200)
  floor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  totalFloors?: number;
}

/**
 * Правка объявления владельцем (MKT-SCR-021).
 *
 * **Чего здесь намеренно нет: тип объекта, тип сделки и адрес.** По ним система
 * ищет дубликаты; разрешив их правку, мы дали бы объявлению «переехать» в другой
 * дом в обход проверки. Решение владельца от 04.09.2026: для этого создаётся
 * новое объявление.
 *
 * Это не декларативный запрет, а физический: глобальный ValidationPipe работает
 * с `forbidNonWhitelisted`, поэтому попытка прислать `propertyType` или
 * `location` отклоняется с 400 до входа в контроллер, а не игнорируется молча.
 */
export class UpdateListingDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateListingPriceDto)
  price?: UpdateListingPriceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateListingCharacteristicsDto)
  characteristics?: UpdateListingCharacteristicsDto;

  @IsOptional()
  @IsString()
  @Length(5, 32)
  representativePhone?: string;
}
