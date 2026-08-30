import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export const TIMELINE_EVENT_TYPES = [
  'lead_stage_changed',
  'lead_assigned',
  'task_created',
  'task_updated',
  'task_completed',
  'task_cancelled',
  'audit_event',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const DEFAULT_TIMELINE_LIMIT = 20;
export const MAX_TIMELINE_LIMIT = 100;

export class ListTimelineDto {
  @IsOptional()
  @IsIn(TIMELINE_EVENT_TYPES)
  type?: TimelineEventType;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TIMELINE_LIMIT)
  limit: number = DEFAULT_TIMELINE_LIMIT;
}
