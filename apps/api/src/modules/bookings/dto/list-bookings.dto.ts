import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_BOOKING_LIST_LIMIT = 20;
export const MAX_BOOKING_LIST_LIMIT = 100;

const BOOKING_STATUSES = ['pending', 'booked', 'rejected', 'expired', 'paid'] as const;

/**
 * BOOK-002: query-фильтры GET /bookings. Глобальный
 * ValidationPipe({whitelist:true, forbidNonWhitelisted:true}) отклоняет
 * любое поле вне этого класса (включая попытку передать organizationId) с
 * 400 до входа в контроллер — тот же паттерн, что ListUnitsQueryDto.
 *
 * developmentId/buildingId/unitId — независимые опциональные фильтры;
 * если клиент передал несколько сразу, unitId побеждает buildingId
 * побеждает developmentId (самый специфичный выигрывает, не пересечение
 * множеств) — см. BookingsService.listBookings.
 */
export class ListBookingsQueryDto {
  @IsOptional()
  @IsMongoId()
  developmentId?: string;

  @IsOptional()
  @IsMongoId()
  buildingId?: string;

  @IsOptional()
  @IsMongoId()
  unitId?: string;

  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: (typeof BOOKING_STATUSES)[number];

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_BOOKING_LIST_LIMIT)
  limit: number = DEFAULT_BOOKING_LIST_LIMIT;
}
