import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CALENDAR_EVENT_TYPES, type CalendarEventType } from '../schemas/calendar-event.schema';

export class CreateCalendarEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsIn(CALENDAR_EVENT_TYPES)
  type?: CalendarEventType;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  meetingUrl?: string;

  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @IsOptional()
  @IsMongoId()
  dealId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  participants?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  externalParticipants?: string[];

  /**
   * ХРАНИТСЯ, НЕ ИНТЕРПРЕТИРУЕТСЯ (осознанно урезанный scope этого прохода —
   * см. CalendarEventDocument докстринг): сервер не планирует email/push по
   * этим значениям.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  reminderMinutes?: number[];

  /** ХРАНИТСЯ, НЕ ИНТЕРПРЕТИРУЕТСЯ — сервер не генерирует серию будущих вхождений. */
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  recurringRule?: string;

  @IsOptional()
  @IsMongoId()
  parentEventId?: string;
}
