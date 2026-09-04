import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import {
  CalendarEventDocument,
  type CalendarEventStatus,
  type CalendarEventType,
} from '../schemas/calendar-event.schema';

/**
 * `scopePositionId` — own-scope сужение (manager: видит/пишет события, где
 * сам participant ИЛИ createdBy). В отличие от Task/Deal (`assignedPositionId`/
 * `ownerPositionId` — одно поле, прямое равенство), own-scope календаря — это
 * ИЛИ, поэтому фильтр строится через `$or`, а не через плоское поле.
 */
export interface CalendarEventScopeFilter {
  scopePositionId?: Types.ObjectId;
}

export interface ListCalendarEventsFilter extends CalendarEventScopeFilter {
  startDate: Date;
  endDate: Date;
  type?: CalendarEventType;
  leadId?: Types.ObjectId;
  dealId?: Types.ObjectId;
}

export interface CreateCalendarEventParams {
  organizationId: Types.ObjectId;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  type?: CalendarEventType;
  status?: CalendarEventStatus;
  isAllDay?: boolean;
  location?: string;
  meetingUrl?: string;
  leadId?: Types.ObjectId;
  dealId?: Types.ObjectId;
  participants?: Types.ObjectId[];
  externalParticipants?: string[];
  reminderMinutes?: number[];
  isRecurring?: boolean;
  recurringRule?: string;
  parentEventId?: Types.ObjectId;
  createdByPositionId: Types.ObjectId;
}

export interface UpdateCalendarEventParams {
  title?: string;
  description?: string | null;
  type?: CalendarEventType;
  status?: CalendarEventStatus;
  isAllDay?: boolean;
  location?: string | null;
  meetingUrl?: string | null;
  leadId?: Types.ObjectId | null;
  dealId?: Types.ObjectId | null;
  participants?: Types.ObjectId[];
  externalParticipants?: string[];
  reminderMinutes?: number[];
  isRecurring?: boolean;
  recurringRule?: string | null;
  parentEventId?: Types.ObjectId | null;
}

/** Не-удалённая запись — тот же `$exists:false` принцип, что фильтр `status:{$ne:'deleted'}` у LeadRepository, только на своём поле (см. CalendarEventDocument.deletedAt докстринг). */
const NOT_DELETED: FilterQuery<CalendarEventDocument> = { deletedAt: { $exists: false } };

function scopeFilter(scopePositionId?: Types.ObjectId): FilterQuery<CalendarEventDocument> {
  if (!scopePositionId) return {};
  return { $or: [{ createdByPositionId: scopePositionId }, { participants: scopePositionId }] };
}

@Injectable()
export class CalendarEventRepository {
  constructor(
    @InjectModel(CalendarEventDocument.name) private readonly model: Model<CalendarEventDocument>,
  ) {}

  async create(params: CreateCalendarEventParams, session?: ClientSession): Promise<CalendarEventDocument> {
    const docData: Record<string, unknown> = {
      organizationId: params.organizationId,
      title: params.title,
      startTime: params.startTime,
      endTime: params.endTime,
      createdByPositionId: params.createdByPositionId,
    };

    if (params.description !== undefined) docData.description = params.description;
    if (params.type !== undefined) docData.type = params.type;
    if (params.status !== undefined) docData.status = params.status;
    if (params.isAllDay !== undefined) docData.isAllDay = params.isAllDay;
    if (params.location !== undefined) docData.location = params.location;
    if (params.meetingUrl !== undefined) docData.meetingUrl = params.meetingUrl;
    if (params.leadId !== undefined) docData.leadId = params.leadId;
    if (params.dealId !== undefined) docData.dealId = params.dealId;
    if (params.participants !== undefined) docData.participants = params.participants;
    if (params.externalParticipants !== undefined) docData.externalParticipants = params.externalParticipants;
    if (params.reminderMinutes !== undefined) docData.reminderMinutes = params.reminderMinutes;
    if (params.isRecurring !== undefined) docData.isRecurring = params.isRecurring;
    if (params.recurringRule !== undefined) docData.recurringRule = params.recurringRule;
    if (params.parentEventId !== undefined) docData.parentEventId = params.parentEventId;

    const [created] = await this.model.create([docData], { session });
    return created!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    scopePositionId?: Types.ObjectId,
    session?: ClientSession,
  ): Promise<CalendarEventDocument | null> {
    const filter: FilterQuery<CalendarEventDocument> = {
      _id: id,
      organizationId,
      ...NOT_DELETED,
      ...scopeFilter(scopePositionId),
    };
    if (session) {
      return this.model.findOne(filter, null, { session }).exec();
    }
    return this.model.findOne(filter).exec();
  }

  /**
   * Диапазон дат обязателен (легаси всегда шлёт диапазон, не бесконечный
   * список) — событие попадает в выдачу, если пересекается с
   * [startDate, endDate], а не только если начинается внутри него: событие,
   * начавшееся вчера и заканчивающееся завтра, обязано быть видно в выдаче
   * "сегодня".
   */
  async listForRange(
    organizationId: Types.ObjectId,
    filter: ListCalendarEventsFilter,
  ): Promise<CalendarEventDocument[]> {
    const queryFilter: FilterQuery<CalendarEventDocument> = {
      organizationId,
      ...NOT_DELETED,
      ...scopeFilter(filter.scopePositionId),
      startTime: { $lte: filter.endDate },
      endTime: { $gte: filter.startDate },
    };

    if (filter.type) queryFilter.type = filter.type;
    if (filter.leadId) queryFilter.leadId = filter.leadId;
    if (filter.dealId) queryFilter.dealId = filter.dealId;

    return this.model.find(queryFilter).sort({ startTime: 1 }).exec();
  }

  /**
   * PATCH /calendar/events/:id — общие поля, НЕ startTime/endTime (см.
   * moveEvent). CAS на version, тот же паттерн, что TaskRepository.updateTask.
   */
  async updateEvent(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    params: UpdateCalendarEventParams,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, number> = {};

    if (params.title !== undefined) $set.title = params.title;
    if (params.type !== undefined) $set.type = params.type;
    if (params.status !== undefined) $set.status = params.status;
    if (params.isAllDay !== undefined) $set.isAllDay = params.isAllDay;
    if (params.participants !== undefined) $set.participants = params.participants;
    if (params.externalParticipants !== undefined) $set.externalParticipants = params.externalParticipants;
    if (params.reminderMinutes !== undefined) $set.reminderMinutes = params.reminderMinutes;
    if (params.isRecurring !== undefined) $set.isRecurring = params.isRecurring;

    const nullable: Array<[keyof UpdateCalendarEventParams, string]> = [
      ['description', 'description'],
      ['location', 'location'],
      ['meetingUrl', 'meetingUrl'],
      ['leadId', 'leadId'],
      ['dealId', 'dealId'],
      ['recurringRule', 'recurringRule'],
      ['parentEventId', 'parentEventId'],
    ];
    for (const [key, field] of nullable) {
      const value = params[key];
      if (value === null) {
        $unset[field] = 1;
      } else if (value !== undefined) {
        $set[field] = value;
      }
    }

    const updateDoc: Record<string, unknown> = { $inc: { version: 1 } };
    if (Object.keys($set).length > 0) updateDoc.$set = $set;
    if (Object.keys($unset).length > 0) updateDoc.$unset = $unset;

    const result = await this.model
      .updateOne({ _id: id, organizationId, version: expectedVersion, ...NOT_DELETED }, updateDoc, { session })
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  /**
   * PATCH /calendar/events/:id/move — легаси отдельно выделяет "перетащить в
   * календаре" от общего PATCH (см. задание). CAS на version, тот же
   * принцип, что updateEvent — конкурентное перетаскивание события двумя
   * людьми не должно тихо перезаписывать друг друга.
   */
  async moveEvent(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    newStartTime: Date,
    newEndTime: Date,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, organizationId, version: expectedVersion, ...NOT_DELETED },
        { $set: { startTime: newStartTime, endTime: newEndTime }, $inc: { version: 1 } },
        { session },
      )
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  /** DELETE /calendar/events/:id — soft delete (см. CalendarEventDocument.deletedAt докстринг). Без expectedVersion — тот же выбор, что DELETE /leads/:leadId. */
  async softDelete(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    deletedAt: Date,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, organizationId, ...NOT_DELETED }, { $set: { deletedAt } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
