import { IsDateString, IsInt, Min } from 'class-validator';

/** PATCH /calendar/events/:id/move — легаси выделяет "перетащить в календаре" отдельно от общего PATCH. */
export class MoveCalendarEventDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsDateString()
  newStartTime!: string;

  @IsDateString()
  newEndTime!: string;
}
