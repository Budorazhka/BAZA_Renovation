import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Легаси-контракт (apps/erp-web/src/features/crm/services/api/types.ts::EventType).
 * Значения перенесены буквально — фронтенд-адаптер (lib/calendar-v2-legacy-adapter.ts)
 * строит собственную таблицу перевода в 4 легаси-типа CalEvent, backend
 * значения не меняет.
 */
export type CalendarEventType = 'meeting' | 'call' | 'reminder' | 'task' | 'lead_followup';

export const CALENDAR_EVENT_TYPES: readonly CalendarEventType[] = [
  'meeting',
  'call',
  'reminder',
  'task',
  'lead_followup',
] as const;

export type CalendarEventStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export const CALENDAR_EVENT_STATUSES: readonly CalendarEventStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

/**
 * CRM-калек CalendarEvent (расширение существующего CRM-модуля, не отдельный
 * `calendar`-модуль — событие календаря концептуально относится к той же
 * tenant/CRM-области, что Lead/Deal/Task).
 *
 * Осознанно урезанный scope (см. задание): `isRecurring`/`recurringRule`/
 * `parentEventId`/`reminderMinutes` ХРАНЯТСЯ, но НЕ ИНТЕРПРЕТИРУЮТСЯ — сервер
 * не разворачивает повторяющееся событие в серию будущих вхождений и не
 * планирует напоминания (email/push). Разбор RRULE-подобных правил —
 * отдельная, самостоятельно сложная фича будущего прохода.
 *
 * `taskId` НЕ хранится здесь намеренно: задача — самостоятельная сущность
 * (TaskDocument), приходящая в календарь со своими `startAt`/`dueAt`.
 * `GET /calendar/unified` ОБЪЕДИНЯЕТ представление CalendarEvent+Task на
 * чтении, не дублирует Task как календарное событие.
 */
@Schema({ collection: 'calendar_events', timestamps: true })
export class CalendarEventDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 255 })
  title!: string;

  @Prop({ required: false, trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ required: true, type: Date })
  startTime!: Date;

  @Prop({ required: true, type: Date })
  endTime!: Date;

  @Prop({ required: true, type: String, enum: CALENDAR_EVENT_TYPES, default: 'meeting' })
  type!: CalendarEventType;

  @Prop({ required: true, type: String, enum: CALENDAR_EVENT_STATUSES, default: 'scheduled' })
  status!: CalendarEventStatus;

  @Prop({ required: false, default: false })
  isAllDay?: boolean;

  @Prop({ required: false, trim: true, maxlength: 500 })
  location?: string;

  @Prop({ required: false, trim: true, maxlength: 2000 })
  meetingUrl?: string;

  @Prop({ type: Types.ObjectId, required: false })
  leadId?: Types.ObjectId;

  /** Deal — такая же полноценная сущность на этой платформе, что Lead (по аналогии). */
  @Prop({ type: Types.ObjectId, required: false })
  dealId?: Types.ObjectId;

  /** Position id участников (не Contact/Identity) — тот же принцип, что TaskDocument.assignedPositionId. */
  @Prop({ type: [Types.ObjectId], default: [] })
  participants!: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  externalParticipants!: string[];

  /** За сколько минут до начала напомнить — ХРАНИТСЯ, не интерпретируется (см. докстринг класса). */
  @Prop({ type: [Number], default: [] })
  reminderMinutes!: number[];

  /** ХРАНИТСЯ, не интерпретируется — сервер не генерирует серию будущих вхождений. */
  @Prop({ required: false, default: false })
  isRecurring?: boolean;

  @Prop({ required: false, trim: true, maxlength: 500 })
  recurringRule?: string;

  @Prop({ type: Types.ObjectId, required: false })
  parentEventId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  createdByPositionId!: Types.ObjectId;

  /** conventions.md разд.5 optimistic concurrency — тот же паттерн, что Task/Deal.version. */
  @Prop({ required: true, default: 0 })
  version!: number;

  /**
   * Soft delete через отдельное поле, НЕ через переиспользование `status`
   * (в отличие от LeadDocument.status:'deleted'): у CalendarEvent `status`
   * уже несёт реальный домен-смысл (scheduled/in_progress/completed/
   * cancelled/no_show — «встреча отменена», а не «запись удалена из
   * календаря»). Переиспользование значения 'cancelled' для soft delete
   * означало бы, что явная отмена события пользователем (PATCH
   * status:'cancelled', событие остаётся видимым в отчётах/истории) и
   * физическое удаление записи из календаря (DELETE) стали бы
   * неотличимы — оба выглядели бы одинаково и одинаково пропадали бы из
   * выдачи. `deletedAt` — отдельный лайфсайкл-маркер, тот же принцип
   * исключения из чтения (`$exists:false` в repository), что `status:'deleted'`
   * у Lead, просто на своём собственном поле.
   */
  @Prop({ required: false, type: Date })
  deletedAt?: Date;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const CalendarEventSchema = SchemaFactory.createForClass(CalendarEventDocument);

CalendarEventSchema.index({ organizationId: 1, startTime: 1 });
CalendarEventSchema.index({ organizationId: 1, createdByPositionId: 1, startTime: 1 });
CalendarEventSchema.index({ organizationId: 1, participants: 1, startTime: 1 });
CalendarEventSchema.index({ organizationId: 1, leadId: 1 });
CalendarEventSchema.index({ organizationId: 1, dealId: 1 });
