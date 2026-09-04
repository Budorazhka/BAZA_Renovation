import { IsDateString, IsIn, IsMongoId, IsOptional } from 'class-validator';
import { CALENDAR_EVENT_TYPES, type CalendarEventType } from '../schemas/calendar-event.schema';

/** GET /calendar/events?startDate=&endDate=&type=&leadId=&dealId= — диапазон обязателен (легаси всегда шлёт диапазон, не бесконечный список). */
export class ListCalendarEventsDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsIn(CALENDAR_EVENT_TYPES)
  type?: CalendarEventType;

  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @IsOptional()
  @IsMongoId()
  dealId?: string;
}

/** GET /calendar/unified?startDate=&endDate= */
export class ListCalendarUnifiedDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
