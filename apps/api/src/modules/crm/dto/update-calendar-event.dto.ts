import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import {
  CALENDAR_EVENT_STATUSES,
  CALENDAR_EVENT_TYPES,
  type CalendarEventStatus,
  type CalendarEventType,
} from '../schemas/calendar-event.schema';

/** НЕ содержит startTime/endTime — перенос события ТОЛЬКО через PATCH /calendar/events/:id/move (см. CalendarEventController докстринг). */
export class UpdateCalendarEventDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsIn(CALENDAR_EVENT_TYPES)
  type?: CalendarEventType;

  @IsOptional()
  @IsIn(CALENDAR_EVENT_STATUSES)
  status?: CalendarEventStatus;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  meetingUrl?: string | null;

  @IsOptional()
  @IsMongoId()
  leadId?: string | null;

  @IsOptional()
  @IsMongoId()
  dealId?: string | null;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  reminderMinutes?: number[];

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  recurringRule?: string | null;

  @IsOptional()
  @IsMongoId()
  parentEventId?: string | null;
}
